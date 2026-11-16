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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { WorkBook } from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Category } from "@/hooks/useCategories";
import { insertProductRecord, applyProductUpdate, approveProduct } from "@/hooks/useProducts";
import { readWorkbook, workbookRows, buildWorkbook } from "@/lib/excelImportExport";
import {
  parseImportRows,
  productsToRows,
  sampleProductTemplateRows,
  ImportRowError,
  ImportExportProduct,
} from "@/lib/productImportExport";
import { isListingWorkbook, listingBoutiqueCode, parseListingWorkbook } from "@/lib/listingSheetImport";

interface Props {
  products: ImportExportProduct[];
  categories: Category[];
  vendorId?: string; // set = vendor-scoped (own catalog only, no Vendor Slug column); unset = admin (full catalog)
  isVendorTrusted?: boolean; // mirrors the product form's own auto-approval rule
  onImported: () => void;
}

function findExistingBySku(products: ImportExportProduct[], sku: string): ImportExportProduct | undefined {
  if (!sku) return undefined;
  return products.find((p) => p.sku === sku || p.variants.some((v) => v.sku === sku));
}

// Every SKU the boutique already uses (products and variants, lower case) -
// read from the database rather than the list on screen, which may not hold
// every product.
async function fetchVendorSkus(vendorId: string): Promise<Set<string>> {
  const skus = new Set<string>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("products")
      .select("sku, product_variants(sku)")
      .eq("vendor_id", vendorId)
      .range(from, from + page - 1);
    if (error) throw error;
    for (const p of data ?? []) {
      if (p.sku) skus.add(p.sku.trim().toLowerCase());
      for (const v of p.product_variants ?? []) if (v.sku) skus.add(v.sku.trim().toLowerCase());
    }
    if (!data || data.length < page) return skus;
  }
}

type ImportResults = {
  kind: "listing" | "table";
  created: number;
  updated: number;
  errors: ImportRowError[];
};

const FROM_SHEET = "from-sheet";

// One dialog, reused for both admin (ProductManagement) and vendor
// (VendorDashboard) - the vendorId prop is the only thing that changes
// behavior: forces every imported row to that vendor and scopes export to
// just that vendor's own products, rather than duplicating this UI per caller.
export function ProductImportExportDialog({ products, categories, vendorId, isVendorTrusted, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [vendors, setVendors] = useState<{ id: string; slug: string; name: string; boutique_code: string | null }[]>([]);
  // Admin only: which boutique a listing sheet is for (default: the
  // Boutique code written at the top of the sheet).
  const [listingVendorId, setListingVendorId] = useState(FROM_SHEET);
  const [results, setResults] = useState<ImportResults | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || vendorId) return; // vendor mode never needs the full vendor list
    supabase
      .from("vendors")
      .select("id, slug, name, boutique_code")
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

  const fileProblem = (message: string) =>
    setResults({ kind: "listing", created: 0, updated: 0, errors: [{ handle: "file", rowNumber: 0, message }] });

  // The AllBoutiqs product listing sheet (one row per colour, Sr 1 / 1A...):
  // only creates new products - a SKU the boutique already has is refused,
  // never overwritten.
  const importListingSheet = async (workbook: WorkBook) => {
    let targetVendorId = vendorId;
    if (!targetVendorId) {
      const sheetCode = listingBoutiqueCode(workbook);
      const byCode = sheetCode
        ? vendors.find((v) => (v.boutique_code ?? "").trim().toLowerCase() === sheetCode.toLowerCase())
        : undefined;
      const chosen = listingVendorId !== FROM_SHEET ? vendors.find((v) => v.id === listingVendorId) : undefined;
      if (chosen && sheetCode && byCode?.id !== chosen.id) {
        return fileProblem(`The sheet's Boutique code is ${sheetCode}, but ${chosen.name} is chosen above - check you have the right file.`);
      }
      targetVendorId = chosen?.id ?? byCode?.id;
      if (!targetVendorId) {
        return fileProblem(
          sheetCode
            ? `No boutique has the code "${sheetCode}" - choose the boutique above.`
            : "Choose the boutique above (the sheet has no Boutique code).",
        );
      }
    }

    setProgress("Checking the sheet...");
    const existingSkus = await fetchVendorSkus(targetVendorId);
    const parsed = parseListingWorkbook(workbook, {
      categories,
      existingSkus,
      vendorId: targetVendorId,
      approvalStatus: vendorId ? (isVendorTrusted ? "approved" : "pending_review") : undefined,
    });
    const errors: ImportRowError[] = parsed.errors.map((e) => ({
      handle: e.rowNumber === 0 ? "file" : [e.sr && `Sr ${e.sr}`, e.sku].filter(Boolean).join(" · ") || "no Sr / SKU",
      rowNumber: e.rowNumber,
      message: e.message,
    }));
    if (parsed.rowsRead === 0 && errors.length === 0) {
      return fileProblem('No products found - fill them in below the "START YOUR PRODUCTS HERE" line.');
    }

    let created = 0;
    for (const [i, product] of parsed.products.entries()) {
      setProgress(`Uploading product ${i + 1} of ${parsed.products.length}...`);
      try {
        const newId = await insertProductRecord(product.formData, [], product.variants);
        if (!vendorId) await approveProduct(newId); // admin import, same as the admin form
        created++;
      } catch (e) {
        errors.push({
          handle: `Sr ${product.sr} · ${product.sku}`,
          rowNumber: product.rowNumbers[0],
          message: `Could not be saved: ${(e as { message?: string })?.message || "unknown error"}`,
        });
      }
    }
    errors.sort((a, b) => a.rowNumber - b.rowNumber);

    setResults({ kind: "listing", created, updated: 0, errors });
    if (created > 0) {
      toast.success(`${created} product${created === 1 ? "" : "s"} uploaded`);
      onImported();
    } else {
      toast.error("Nothing was uploaded - see the reasons below");
    }
  };

  const downloadProblems = async () => {
    if (!results) return;
    await buildWorkbook(
      results.errors.map((e) => ({ Row: e.rowNumber || "", "Sr / SKU": e.handle, Problem: e.message })),
      "product-upload-problems.xlsx",
    );
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    setResults(null);
    try {
      const workbook = await readWorkbook(file);
      if (isListingWorkbook(workbook)) {
        await importListingSheet(workbook);
        return;
      }

      const rawRows = await workbookRows(workbook);
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
            const newId = await insertProductRecord(group.formData, group.imageUrls, group.variants);
            if (!vendorId) await approveProduct(newId); // admin import, same as the admin form
            created++;
          }
        } catch (e: any) {
          errors.push({ handle: group.handle, rowNumber: 0, message: e.message || "Import failed" });
        }
      }

      setResults({ kind: "table", created, updated, errors });
      if (created + updated > 0) {
        toast.success(`${created} created, ${updated} updated`);
        onImported();
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to parse file");
    } finally {
      setImporting(false);
      setProgress(null);
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
              Upload the AllBoutiqs product listing sheet (one row per colour) to add new products, or an
              export / sample-template file (one row per variant) to add and update them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!vendorId && (
              <div className="space-y-1.5">
                <Label className="text-xs">Boutique for a listing sheet</Label>
                <Select value={listingVendorId} onValueChange={setListingVendorId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FROM_SHEET}>Use the Boutique code written in the sheet</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        {v.boutique_code ? ` (${v.boutique_code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
              {progress && <p className="mt-1.5 text-xs text-muted-foreground">{progress}</p>}
            </div>

            {!vendorId && vendors.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <p className="mb-1">Every product needs a Vendor Slug - one of these:</p>
                <ul className="max-h-24 overflow-y-auto rounded-md border border-border px-2 py-1">
                  {vendors.map((v) => (
                    <li key={v.id}>
                      <span className="font-mono text-foreground">{v.slug}</span> - {v.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results && (
              <div className="space-y-2 text-sm border-t border-border pt-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">{results.created} created</Badge>
                  {results.kind === "table" && <Badge variant="secondary">{results.updated} updated</Badge>}
                  {results.errors.length > 0 && (
                    <Badge variant="destructive">
                      {results.errors.length} {results.kind === "listing" ? "rows not uploaded" : "failed"}
                    </Badge>
                  )}
                </div>
                {results.errors.length > 0 && (
                  <>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {results.errors.map((e, i) => (
                        <p key={i} className="text-xs text-destructive">
                          {e.rowNumber > 0 ? `Row ${e.rowNumber} ` : ""}
                          ({e.handle}): {e.message}
                        </p>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={downloadProblems} className="gap-2">
                      <Download className="h-3.5 w-3.5" /> Download this list
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
