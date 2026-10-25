import { useState } from "react";
import { Loader2, Plus, Ruler, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchTemplate, keyFor, type ChartMeasurement, type SizeChartTemplate } from "@/lib/sizeCharts";

// Admin: a category's size chart template - which measurements (rows) and
// sizes (columns) every boutique's chart in that category has. Boutiques
// only fill in the numbers.
export function SizeChartTemplateButton({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState(categoryName);
  const [unit, setUnit] = useState<"in" | "cm">("in");
  const [sizes, setSizes] = useState<string[]>([]);
  const [newSize, setNewSize] = useState("");
  const [measurements, setMeasurements] = useState<ChartMeasurement[]>([]);

  const load = async () => {
    setOpen(true);
    setLoading(true);
    const t: SizeChartTemplate | null = await fetchTemplate(categoryId);
    setTemplateId(t?.id ?? null);
    setName(t?.name || categoryName);
    setUnit(t?.unit ?? "in");
    setSizes(t?.sizes ?? ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"]);
    setMeasurements(t?.measurements ?? []);
    setLoading(false);
  };

  const addSize = () => {
    const s = newSize.trim().toUpperCase().slice(0, 10);
    if (!s || sizes.includes(s)) return;
    setSizes([...sizes, s]);
    setNewSize("");
  };

  const setM = (key: string, patch: Partial<ChartMeasurement>) =>
    setMeasurements((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  const save = async () => {
    const ms = measurements.map((m) => ({ ...m, name: m.name.trim(), hint: m.hint.trim() })).filter((m) => m.name);
    if (!sizes.length) return toast.error("Add at least one size");
    if (!ms.length) return toast.error("Add at least one measurement");
    setSaving(true);
    const row = { category_id: categoryId, name: name.trim() || categoryName, unit, sizes, measurements: ms };
    const { error } = templateId
      ? await supabase.from("size_guides").update(row as any).eq("id", templateId)
      : await supabase.from("size_guides").insert(row as any);
    setSaving(false);
    if (error) return toast.error(error.message || "Couldn't save the template");
    toast.success(`${categoryName} size chart template saved`);
    setOpen(false);
  };

  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Size chart template for ${categoryName}`} title="Size chart template" onClick={load}>
        <Ruler className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Size chart template · {categoryName}</DialogTitle>
            <DialogDescription>
              Every boutique's chart in this category gets these measurements and sizes - boutiques only fill in the
              numbers. Removing a size or measurement hides boutiques' numbers for it.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <div className="space-y-1.5">
                  <Label htmlFor="sct-name">Chart name</Label>
                  <Input id="sct-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                </div>
                <div className="space-y-1.5">
                  <Label>Unit</Label>
                  <Select value={unit} onValueChange={(v) => setUnit(v as "in" | "cm")}>
                    <SelectTrigger aria-label="Unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Inches</SelectItem>
                      <SelectItem value="cm">Centimetres</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sizes (columns)</Label>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
                      {s}
                      <button type="button" aria-label={`Remove size ${s}`} onClick={() => setSizes(sizes.filter((x) => x !== s))}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 max-w-xs">
                  <Input
                    aria-label="New size"
                    placeholder="e.g. 3XL or 32"
                    value={newSize}
                    onChange={(e) => setNewSize(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSize())}
                  />
                  <Button type="button" variant="outline" onClick={addSize}>
                    Add
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Measurements (rows)</Label>
                {measurements.map((m, i) => (
                  <div key={m.key} className="grid gap-2 sm:grid-cols-[180px_1fr_auto] items-start">
                    <Input aria-label={`Measurement ${i + 1} name`} value={m.name} maxLength={40} onChange={(e) => setM(m.key, { name: e.target.value })} />
                    <Input
                      aria-label={`Measurement ${i + 1} how to measure`}
                      placeholder="How to measure (shown to customers)"
                      value={m.hint}
                      maxLength={160}
                      onChange={(e) => setM(m.key, { hint: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${m.name || `measurement ${i + 1}`}`}
                      onClick={() => setMeasurements(measurements.filter((x) => x.key !== m.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() =>
                    setMeasurements([
                      ...measurements,
                      { key: keyFor(`measurement ${measurements.length + 1}`, measurements.map((m) => m.key)), name: "", hint: "", values: {} },
                    ])
                  }
                >
                  <Plus className="h-4 w-4" /> Add measurement
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || loading}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
