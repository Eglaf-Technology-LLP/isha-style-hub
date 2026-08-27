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
import {
  parseGiftCardRows,
  giftCardsToRows,
  sampleGiftCardTemplateRows,
  GiftCardRowError,
} from "@/lib/giftCardImportExport";

interface GiftCardLike {
  id: string;
  code: string;
  initial_balance: number;
  current_balance: number;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  is_active: boolean;
  expires_at: string | null;
}

interface Props {
  giftCards: GiftCardLike[];
  onImported: () => void;
}

export function GiftCardImportExportDialog({ giftCards, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ created: number; updated: number; errors: GiftCardRowError[] } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadSample = async () => {
    await buildWorkbook(sampleGiftCardTemplateRows(), "gift-card-import-sample.xlsx");
  };

  const downloadCurrent = async () => {
    await buildWorkbook(giftCardsToRows(giftCards), "gift-cards-export.xlsx");
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    setResults(null);
    try {
      const rawRows = await parseWorkbook(file);
      const { rows, errors } = parseGiftCardRows(rawRows);

      let created = 0;
      let updated = 0;
      for (const row of rows) {
        if (row.giftCardId) {
          const { error } = await supabase
            .from("gift_cards")
            .update({
              code: row.code,
              initial_balance: row.initial_balance,
              current_balance: row.current_balance,
              recipient_name: row.recipient_name,
              recipient_email: row.recipient_email,
              message: row.message,
              is_active: row.is_active,
              expires_at: row.expires_at,
            })
            .eq("id", row.giftCardId);
          if (error) {
            errors.push({ rowNumber: 0, message: `"${row.code}": ${error.message}` });
            continue;
          }
          updated++;
        } else {
          const { error } = await supabase.from("gift_cards").insert({
            code: row.code,
            initial_balance: row.initial_balance,
            current_balance: row.current_balance,
            recipient_name: row.recipient_name,
            recipient_email: row.recipient_email,
            message: row.message,
            is_active: row.is_active,
            expires_at: row.expires_at,
          });
          if (error) {
            errors.push({ rowNumber: 0, message: `"${row.code}": ${error.message}` });
            continue;
          }
          created++;
        }
      }

      setResults({ created, updated, errors });
      if (created + updated > 0) {
        toast.success(`${created} created, ${updated} updated`);
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
            <DialogTitle>Import / Export Gift Cards</DialogTitle>
            <DialogDescription>Bulk-issue or update gift cards via an Excel file</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={downloadSample} className="gap-2">
                <Download className="h-4 w-4" /> Sample Template
              </Button>
              <Button variant="outline" onClick={downloadCurrent} className="gap-2">
                <Download className="h-4 w-4" /> Export Current
              </Button>
            </div>

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
                  <Badge variant="default">{results.created} created</Badge>
                  <Badge variant="secondary">{results.updated} updated</Badge>
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
