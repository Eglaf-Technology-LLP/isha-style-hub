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
import { Category, useCategories } from "@/hooks/useCategories";
import { parseWorkbook, buildWorkbook } from "@/lib/excelImportExport";
import {
  categoriesToRows,
  sampleCategoryTemplateRows,
  parseCategoryRows,
  CategoryRowError,
} from "@/lib/categoryImportExport";

interface Props {
  categories: Category[];
}

// Admin-only, matches CategoryManagement's own scope (categories are a
// shared platform-wide taxonomy, not something a vendor owns).
export function CategoryImportExportDialog({ categories }: Props) {
  const { addCategory, updateCategory } = useCategories();
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ created: number; updated: number; errors: CategoryRowError[] } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadSample = async () => {
    await buildWorkbook(sampleCategoryTemplateRows(), "category-import-sample.xlsx");
  };

  const downloadCurrent = async () => {
    await buildWorkbook(categoriesToRows(categories), "categories-export.xlsx");
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    setResults(null);
    try {
      const rawRows = await parseWorkbook(file);
      const { rows, errors } = parseCategoryRows(rawRows);

      let created = 0;
      let updated = 0;
      for (const row of rows) {
        if (row.categoryId) {
          const existing = categories.find((c) => c.id === row.categoryId);
          if (!existing) {
            errors.push({ rowNumber: 0, message: `Category ID "${row.categoryId}" not found - skipped` });
            continue;
          }
          const { error } = await supabase
            .from("categories")
            .update({ name: row.name, slug: row.slug, description: row.description, image_url: row.imageUrl })
            .eq("id", row.categoryId);
          if (error) {
            errors.push({ rowNumber: 0, message: `"${row.name}": ${error.message}` });
            continue;
          }
          updated++;
        } else {
          const result = await addCategory(row.name, row.description ?? undefined, undefined, row.imageUrl ?? undefined);
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
            <DialogTitle>Import / Export Categories</DialogTitle>
            <DialogDescription>Bulk-manage categories via an Excel file</DialogDescription>
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
