import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseWorkbook, buildWorkbook } from "@/lib/excelImportExport";
import { parseVendorRows, vendorsToRows, VendorRowError } from "@/lib/vendorImportExport";

interface VendorLike {
  id: string;
  name: string;
  slug: string;
  contact_email: string | null;
  status: string;
  is_trusted: boolean;
  commission_rate: number;
  shipping_flat_rate: number;
  free_shipping_threshold: number | null;
  return_window_days: number;
  description: string | null;
}

interface Props {
  vendors: VendorLike[];
  onImported: () => void;
}

// Update-only, by design - there's no vendor-account-creation flow
// anywhere in this admin UI (vendors self-register and land in "pending"),
// so a "sample template" with a fictional Vendor ID would just fail
// validation on re-upload. Export Current IS the template here: it always
// has real ids ready to edit and re-import, which is a more useful
// starting point than a fake row anyway.
export function VendorImportExportDialog({ vendors, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ updated: number; errors: VendorRowError[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadCurrent = async () => {
    await buildWorkbook(vendorsToRows(vendors), "vendors-export.xlsx");
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    setResults(null);
    try {
      const rawRows = await parseWorkbook(file);
      const existingIds = new Set(vendors.map((v) => v.id));
      const { rows, errors } = parseVendorRows(rawRows, existingIds);

      let updated = 0;
      for (const row of rows) {
        const patch: Record<string, unknown> = {};
        if (row.status !== null) patch.status = row.status;
        if (row.is_trusted !== null) patch.is_trusted = row.is_trusted;
        if (row.commission_rate !== null) patch.commission_rate = row.commission_rate;
        if (row.shipping_flat_rate !== null) patch.shipping_flat_rate = row.shipping_flat_rate;
        if (row.free_shipping_threshold !== null) patch.free_shipping_threshold = row.free_shipping_threshold;
        if (row.return_window_days !== null) patch.return_window_days = row.return_window_days;
        if (row.description !== null) patch.description = row.description;

        if (Object.keys(patch).length === 0) continue;

        const { error } = await supabase.from("vendors").update(patch).eq("id", row.vendorId);
        if (error) {
          errors.push({ rowNumber: 0, message: `Vendor ${row.vendorId}: ${error.message}` });
          continue;
        }
        updated++;
      }

      setResults({ updated, errors });
      if (updated > 0) {
        toast.success(`${updated} vendor(s) updated`);
        onImported();
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to parse file");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <FileSpreadsheet className="h-4 w-4" /> Import / Export
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResults(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import / Export Vendor Accounts</DialogTitle>
            <DialogDescription>
              Bulk-edit vendor settings (commission, shipping, trusted status, etc.) via Excel.
              This can only update existing accounts - vendors sign up themselves, so export
              first, edit the values, then re-upload the same file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Button variant="outline" onClick={downloadCurrent} className="w-full gap-2">
              <Download className="h-4 w-4" /> Export Current Vendors
            </Button>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={importing} className="w-full gap-2">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Import from Excel
              </Button>
            </div>

            {results && (
              <div className="space-y-2 text-sm border-t border-border pt-3">
                <div className="flex gap-2">
                  <Badge variant="default">{results.updated} updated</Badge>
                  {results.errors.length > 0 && (
                    <Badge variant="destructive">{results.errors.length} failed</Badge>
                  )}
                </div>
                {results.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {results.errors.map((e, i) => (
                      <p key={i} className="text-xs text-destructive">
                        {e.rowNumber > 0 ? `Row ${e.rowNumber}: ` : ""}
                        {e.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
