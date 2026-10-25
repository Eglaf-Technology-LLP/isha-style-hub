import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Ruler } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  cleanNumber,
  hasAnyValue,
  parseTemplate,
  standardValues,
  unitLabel,
  type ChartValues,
  type SizeChartTemplate,
} from "@/lib/sizeCharts";

// Boutique "Size charts": one chart per category, in AllBoutiqs' fixed
// template - the boutique only fills in the numbers. Shown on its product
// pages in that category straight away (no approval).
// A chart the boutique hasn't saved starts from AllBoutiqs' starting values.
const startingDraft = (t: SizeChartTemplate, own: ChartValues | undefined): ChartValues =>
  hasAnyValue(own) ? own! : standardValues(t);

export function VendorSizeCharts({ vendorId }: { vendorId: string }) {
  const [templates, setTemplates] = useState<(SizeChartTemplate & { categoryName: string })[] | null>(null);
  const [saved, setSaved] = useState<Record<string, ChartValues>>({});
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChartValues>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: guides }, { data: cats }, { data: charts }] = await Promise.all([
        supabase.from("size_guides").select("*").not("category_id", "is", null),
        supabase.from("categories").select("id, name").order("name"),
        supabase.from("vendor_size_charts").select("category_id, values").eq("vendor_id", vendorId),
      ]);
      const names = new Map((cats ?? []).map((c) => [c.id, c.name]));
      const list = (guides ?? [])
        .map((g) => ({ ...parseTemplate(g), categoryName: names.get(g.category_id!) ?? g.name }))
        .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
      const own = Object.fromEntries((charts ?? []).map((c) => [c.category_id, (c.values as ChartValues) ?? {}]));
      setTemplates(list);
      setSaved(own);
      if (list.length) {
        setActive(list[0].category_id);
        setDraft(startingDraft(list[0], own[list[0].category_id!]));
      }
    })();
  }, [vendorId]);

  const template = useMemo(() => templates?.find((t) => t.category_id === active) ?? null, [templates, active]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved[active ?? ""] ?? {});

  const pick = (categoryId: string) => {
    if (dirty && hasAnyValue(saved[active ?? ""]) && !window.confirm("You have unsaved numbers in this chart. Leave without saving?")) return;
    setActive(categoryId);
    const t = templates?.find((x) => x.category_id === categoryId);
    setDraft(t ? startingDraft(t, saved[categoryId]) : saved[categoryId] ?? {});
  };

  // Not saved yet: the chart opens with AllBoutiqs' starting values
  // (Developer Corrections Part 8, 40), for the boutique to change.
  const notSavedYet = !!template && !hasAnyValue(saved[template.category_id!]);

  const setCell = (key: string, size: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? {}), [size]: cleanNumber(value) } }));

  const save = async () => {
    if (!template?.category_id) return;
    // Drop empty cells so the chart only holds what was filled in.
    const values: ChartValues = Object.fromEntries(
      Object.entries(draft)
        .map(([k, row]) => [k, Object.fromEntries(Object.entries(row ?? {}).filter(([, v]) => String(v).trim()))])
        .filter(([, row]) => Object.keys(row as object).length),
    );
    setSaving(true);
    const { error } = await supabase
      .from("vendor_size_charts")
      .upsert({ vendor_id: vendorId, category_id: template.category_id, values }, { onConflict: "vendor_id,category_id" });
    setSaving(false);
    if (error) return toast.error(error.message || "Couldn't save the size chart");
    setSaved((s) => ({ ...s, [template.category_id!]: values }));
    setDraft(values);
    toast.success(`${template.categoryName} size chart saved - it's on your ${template.categoryName} products now`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5" /> Size charts
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          One chart per category. AllBoutiqs sets which measurements and sizes each chart has - you just fill in your
          numbers. Customers see it as "Size chart" on your products in that category. Leave a size empty if you don't
          make it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!templates ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No size chart templates yet - AllBoutiqs will add them.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Category">
              {templates.map((t) => (
                <Button
                  key={t.id}
                  role="tab"
                  aria-selected={t.category_id === active}
                  variant={t.category_id === active ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => pick(t.category_id!)}
                >
                  {t.name || t.categoryName}
                  {hasAnyValue(saved[t.category_id!]) && <CheckCircle2 className="h-3.5 w-3.5" aria-label="filled in" />}
                </Button>
              ))}
            </div>

            {template && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {template.name} · garment measurements in {unitLabel(template.unit)}
                  </p>
                  {hasAnyValue(saved[template.category_id!]) ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                      Showing on your products
                    </Badge>
                  ) : (
                    <Badge variant="outline">Starting values - not saved yet</Badge>
                  )}
                </div>
                {notSavedYet && hasAnyValue(draft) && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Starting values - change to your own measurements, and leave a size empty if you don't make it. Then
                    save the chart.
                  </p>
                )}
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left font-medium p-2 min-w-[160px]">Measurement</th>
                        {template.sizes.map((s) => (
                          <th key={s} className="font-medium p-2 text-center min-w-[64px]">
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {template.measurements.map((m) => (
                        <tr key={m.key} className="border-t border-border">
                          <td className="p-2 align-top">
                            <div className="font-medium">{m.name}</div>
                            {m.hint && <div className="text-xs text-muted-foreground">{m.hint}</div>}
                          </td>
                          {template.sizes.map((s) => (
                            <td key={s} className="p-1.5">
                              <Input
                                aria-label={`${m.name} ${s}`}
                                inputMode="decimal"
                                value={draft[m.key]?.[s] ?? ""}
                                onChange={(e) => setCell(m.key, s, e.target.value)}
                                className={cn("h-9 text-center tabular-nums px-1")}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={save} disabled={saving || !dirty}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save {template.name || template.categoryName} chart
                  </Button>
                  {hasAnyValue(standardValues(template)) && (
                    <Button variant="outline" onClick={() => setDraft(standardValues(template))}>
                      Start from AllBoutiqs' standard numbers
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
