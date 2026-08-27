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
import { Category } from "@/hooks/useCategories";
import { insertProductRecord, applyProductUpdate } from "@/hooks/useProducts";
import { parseWorkbook, buildWorkbook } from "@/lib/excelImportExport";
import {
  parseImportRows,
  productsToRows,
  sampleProductTemplateRows,
  ImportRowError,
  ImportExportProduct,
} from "@/lib/productImportExport";

interface Props {
  products: ImportExportProduct[];
  categories: Category[];
  vendorId?: string; // set = vendor-scoped (own catalog only, no Vendor Slug column); unset = admin (full catalog)
  isVendorTrusted?: boolean; // mirrors VendorProductDialog's own auto-approval rule
  onImported: () => void;
}

function findExistingBySku(products: ImportExportProduct[], sku: string): ImportExportProduct | undefined {
  if (!sku) return undefined;
  return products.find((p) => p.sku === sku || p.variants.some((v) => v.sku === sku));
}

// One dialog, reused for both admin (ProductManagement) and vendor
// (VendorDashboard) - the vendorId prop is the only thing that changes
// behavior: forces every imported row to that vendor and scopes export to
// just that vendor's own products, rather than duplicating this UI per caller.
export function ProductImportExportDialog({ products, categories, vendorId, isVendorTrusted, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [vendors, setVendors] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [results, setResults] = useState<{ created: number; updated: number; errors: ImportRowError[] } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || vendorId) return; // vendor mode never needs the full vendor list
    supabase
      .from("vendors")
      .select("id, slug, name")
      .order("name")
      .then(({ data }) => setVendors(data ?? []));
  }, [open, vendorId]);

  const categoryIdByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const vendorIdBySlug = new Map(vendors.map((v) => [v.slug.toLowerCase(), v.id]));
  const vendorSlugById = new Map(vendors.map((v) => [v.id, v.slug]));

  const downloadSample = async () => {
    await buildWorkbook(sampleProductTemplateRows(!vendorId), "product-import-sample.xlsx");
  };

  const downloadCurrent = async () => {
    const scoped = vendorId ? products.filter((p) => p.vendor_id === vendorId) : products;
    await buildWorkbook(
      productsToRows(scoped, { includeVendorColumn: !vendorId, vendorSlugById, categoryNameById }),
      "products-export.xlsx",
    );
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    setResults(null);
    try {
      const rawRows = await parseWorkbook(file);
      const { groups, errors } = parseImportRows(rawRows, {
        categoryIdByName,
        vendorIdBySlug,
        forcedVendorId: vendorId,
        forcedVendorTrusted: isVendorTrusted,
      });

      let created = 0;
      let updated = 0;

      for (const group of groups) {
        try {
          const existing =
            (group.productId ? products.find((p) => p.id === group.productId) : undefined) ??
            findExistingBySku(products, group.formData.sku) ??
            (group.variants[0]?.sku ? findExistingBySku(products, group.variants[0].sku) : undefined);

          if (existing) {
            // applyProductUpdate diffs incoming variants against existing
            // ones BY ID (not SKU) to decide update-in-place vs remove-
            // and-recreate - parseImportRows has no way to know the real
            // existing variant id at parse time, so every row got a fresh
            // random one. Reconciled here, now that the existing product
            // is known: a SKU match reuses the real id (update in place,
            // stock continuity preserved); no match keeps the fresh id
            // (a genuinely new variant, correctly inserted).
            const reconciledVariants = group.variants.map((v) => {
              const match = v.sku ? existing.variants.find((ev) => ev.sku === v.sku) : undefined;
              return match ? { ...v, id: match.id } : v;
            });
            await applyProductUpdate(existing.id, group.formData, existing, undefined, reconciledVariants);
            updated++;
          } else {
            await insertProductRecord(group.formData, group.imageUrls, group.variants);
            created++;
          }
        } catch (e: any) {
          errors.push({ handle: group.handle, rowNumber: 0, message: e.message || "Import failed" });
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import / Export Products</DialogTitle>
            <DialogDescription>
              Bulk-manage products, variants, and specifications via an Excel file. One row per
              variant/SKU - see the sample template for the exact format.
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
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="w-full gap-2"
              >
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
                        {e.rowNumber > 0 ? `Row ${e.rowNumber} ` : ""}
                        ({e.handle}): {e.message}
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
