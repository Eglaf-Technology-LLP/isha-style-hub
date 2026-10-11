import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Edit, Loader2, Plus, Receipt, Upload } from "lucide-react";
import { toast } from "sonner";
import { buildWorkbook, parseBoolean, parseWorkbook } from "@/lib/excelImportExport";
import { describeGst, useHsnCodes, type HsnCode, type HsnCodeInput } from "@/hooks/useHsnCodes";

const COLUMNS = {
  code: "HSN Code",
  description: "Description",
  rate: "GST % (up to price limit)",
  limit: "Price limit per piece (Rs) - blank if one rate",
  rateAbove: "GST % (above price limit)",
  active: "Active (TRUE/FALSE)",
} as const;

const EMPTY: HsnCodeInput = {
  code: "",
  description: "",
  gst_rate: 5,
  price_limit: null,
  gst_rate_above_limit: null,
  is_active: true,
};

// A problem with one HSN row, or null if it's fine.
function rowProblem(r: HsnCodeInput): string | null {
  if (!/^[0-9]{4,8}$/.test(r.code)) return "HSN code must be 4 to 8 digits";
  if (!r.description.trim()) return "Description is required";
  const okRate = (n: number | null) => n != null && Number.isFinite(n) && n >= 0 && n <= 40;
  if (!okRate(r.gst_rate)) return "GST % must be between 0 and 40";
  if ((r.price_limit == null) !== (r.gst_rate_above_limit == null))
    return "Give both a price limit and the GST % above it, or neither";
  if (r.price_limit != null && !(r.price_limit > 0)) return "Price limit must be more than 0";
  if (r.gst_rate_above_limit != null && !okRate(r.gst_rate_above_limit)) return "GST % above the limit must be between 0 and 40";
  return null;
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

// The GST rate list: one row per HSN code, linked to categories (each
// product takes its GST from its category's HSN). AllBoutiqs will send the
// final list - it can be uploaded here as Excel.
export function HsnManagement() {
  const { hsnCodes, loading, saveHsnCodes } = useHsnCodes();
  const [editing, setEditing] = useState<{ original: HsnCode | null; form: HsnCodeInput } | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!editing) return;
    const problem = rowProblem(editing.form);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    const error = await saveHsnCodes([{ ...editing.form, description: editing.form.description.trim() }]);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`HSN ${editing.form.code} saved`);
    setEditing(null);
  };

  const exportExcel = async () => {
    await buildWorkbook(
      hsnCodes.map((h) => ({
        [COLUMNS.code]: h.code,
        [COLUMNS.description]: h.description,
        [COLUMNS.rate]: Number(h.gst_rate),
        [COLUMNS.limit]: h.price_limit ?? "",
        [COLUMNS.rateAbove]: h.gst_rate_above_limit ?? "",
        [COLUMNS.active]: h.is_active ? "TRUE" : "FALSE",
      })),
      "hsn-gst-rates.xlsx",
    );
  };

  const importExcel = async (file: File) => {
    setImporting(true);
    try {
      const raw = await parseWorkbook(file);
      const rows: HsnCodeInput[] = [];
      const problems: string[] = [];
      raw.forEach((r, i) => {
        const row: HsnCodeInput = {
          code: String(r[COLUMNS.code] ?? "").trim(),
          description: String(r[COLUMNS.description] ?? "").trim(),
          gst_rate: Number(r[COLUMNS.rate]),
          price_limit: numOrNull(String(r[COLUMNS.limit] ?? "")),
          gst_rate_above_limit: numOrNull(String(r[COLUMNS.rateAbove] ?? "")),
          is_active: parseBoolean(String(r[COLUMNS.active] ?? ""), true),
        };
        if (!row.code && !row.description) return;
        const problem = rowProblem(row);
        if (problem) problems.push(`Row ${i + 2} (${row.code || "no code"}): ${problem}`);
        else rows.push(row);
      });
      if (problems.length) {
        toast.error(`Nothing imported - fix these rows first: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? ` and ${problems.length - 3} more` : ""}`);
        return;
      }
      if (!rows.length) {
        toast.error("No HSN rows found in that file");
        return;
      }
      const error = await saveHsnCodes(rows);
      if (error) toast.error(error);
      else toast.success(`${rows.length} HSN codes imported (new codes added, existing ones updated)`);
    } catch (e: any) {
      toast.error(e.message || "Couldn't read that file");
    } finally {
      setImporting(false);
    }
  };

  const f = editing?.form;
  const setForm = (patch: Partial<HsnCodeInput>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 p-6 border-b border-border">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> HSN codes &amp; GST rates
          </h3>
          <p className="text-sm text-muted-foreground">
            Each category is linked to one HSN code; its products are taxed at that code's GST rate on the customer
            invoice. Prices include GST.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={!hsnCodes.length} className="gap-2">
            <Download className="h-4 w-4" /> Export Excel
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) importExcel(file);
            }}
          />
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={importing} className="gap-2">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import Excel
          </Button>
          <Button onClick={() => setEditing({ original: null, form: { ...EMPTY } })} className="gap-2">
            <Plus className="h-4 w-4" /> Add HSN code
          </Button>
        </div>
      </div>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HSN</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>GST</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {hsnCodes.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono">{h.code}</TableCell>
                    <TableCell className="text-sm">{h.description}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{describeGst(h)}</TableCell>
                    <TableCell>
                      {h.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit HSN ${h.code}`}
                        onClick={() =>
                          setEditing({
                            original: h,
                            form: {
                              code: h.code,
                              description: h.description,
                              gst_rate: Number(h.gst_rate),
                              price_limit: h.price_limit == null ? null : Number(h.price_limit),
                              gst_rate_above_limit: h.gst_rate_above_limit == null ? null : Number(h.gst_rate_above_limit),
                              is_active: h.is_active,
                            },
                          })
                        }
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.original ? `Edit HSN ${editing.original.code}` : "Add HSN code"}</DialogTitle>
            <DialogDescription>
              For apparel and footwear, GST depends on the price per piece/pair: set the price limit and the rate above
              it. Leave both blank when one rate applies at any price.
            </DialogDescription>
          </DialogHeader>
          {f && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="hsn-code">HSN code</Label>
                  <Input
                    id="hsn-code"
                    inputMode="numeric"
                    maxLength={8}
                    value={f.code}
                    disabled={!!editing?.original}
                    onChange={(e) => setForm({ code: e.target.value.replace(/\D/g, "") })}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="hsn-desc">Description</Label>
                  <Input id="hsn-desc" value={f.description} onChange={(e) => setForm({ description: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="hsn-rate">GST %</Label>
                  <Input id="hsn-rate" type="number" min={0} max={40} step="0.01" value={f.gst_rate} onChange={(e) => setForm({ gst_rate: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hsn-limit">Up to price (₹)</Label>
                  <Input
                    id="hsn-limit"
                    type="number"
                    min={0}
                    placeholder="Any price"
                    value={f.price_limit ?? ""}
                    onChange={(e) => setForm({ price_limit: numOrNull(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hsn-above">GST % above</Label>
                  <Input
                    id="hsn-above"
                    type="number"
                    min={0}
                    max={40}
                    step="0.01"
                    placeholder="—"
                    value={f.gst_rate_above_limit ?? ""}
                    onChange={(e) => setForm({ gst_rate_above_limit: numOrNull(e.target.value) })}
                  />
                </div>
              </div>
              <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                Active (can be chosen for categories)
                <Switch checked={f.is_active} onCheckedChange={(v) => setForm({ is_active: v })} />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
