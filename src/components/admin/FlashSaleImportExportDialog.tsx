import { useEffect, useRef, useState } from "react";
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
import { FlashSale, FlashSaleFormData } from "@/hooks/useFlashSales";
import { parseWorkbook, buildWorkbook } from "@/lib/excelImportExport";
import {
  parseFlashSaleRows,
  flashSalesToRows,
  sampleFlashSaleTemplateRows,
  FlashSaleRowError,
} from "@/lib/flashSaleImportExport";

interface Props {
  flashSales: FlashSale[];
  createFlashSale: (data: FlashSaleFormData) => Promise<FlashSale | null>;
  updateFlashSale: (id: string, data: Partial<FlashSaleFormData>) => Promise<boolean>;
}

export function FlashSaleImportExportDialog({ flashSales, createFlashSale, updateFlashSale }: Props) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [productMaps, setProductMaps] = useState<{
    idBySku: Map<string, string>;
    skuById: Map<string, string>;
  }>({ idBySku: new Map(), skuById: new Map() });
  const [results, setResults] = useState<{ created: number; updated: number; errors: FlashSaleRowError[] } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("products")
      .select("id, sku")
      .then(({ data }) => {
        const idBySku = new Map<string, string>();
        const skuById = new Map<string, string>();
        (data ?? []).forEach((p) => {
          if (p.sku) {
            idBySku.set(p.sku.toLowerCase(), p.id);
            skuById.set(p.id, p.sku);
          }
        });
        setProductMaps({ idBySku, skuById });
      });
  }, [open]);

  const downloadSample = async () => {
    await buildWorkbook(sampleFlashSaleTemplateRows(), "flash-sale-import-sample.xlsx");
  };

  const downloadCurrent = async () => {
    await buildWorkbook(flashSalesToRows(flashSales, productMaps.skuById), "flash-sales-export.xlsx");
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    setResults(null);
    try {
      const rawRows = await parseWorkbook(file);
      const { rows, errors } = parseFlashSaleRows(rawRows, productMaps.idBySku);

      let created = 0;
      let updated = 0;
      for (const row of rows) {
        const formData: FlashSaleFormData = {
          name: row.name,
          description: row.description,
          discount_percentage: row.discount_percentage,
          product_ids: row.product_ids,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          is_active: row.is_active,
        };
        if (row.flashSaleId) {
          const ok = await updateFlashSale(row.flashSaleId, formData);
          if (!ok) {
            errors.push({ rowNumber: 0, message: `"${row.name}" failed to update` });
            continue;
          }
          updated++;
        } else {
          const result = await createFlashSale(formData);
          if (!result) {
            errors.push({ rowNumber: 0, message: `"${row.name}" failed to import` });
            continue;
          }
          created++;
        }
      }

      setResults({ created, updated, errors });
      if (created + updated > 0) toast.success(`${created} created, ${updated} updated`);
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
            <DialogTitle>Import / Export Flash Sales</DialogTitle>
            <DialogDescription>
              Bulk-create or update flash sales via an Excel file - products are matched by SKU
            </DialogDescription>
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
