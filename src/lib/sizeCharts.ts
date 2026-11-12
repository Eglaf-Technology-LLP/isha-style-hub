import { supabase } from "@/integrations/supabase/client";

// Size charts: AllBoutiqs fixes one template per category (size_guides -
// which measurements and which sizes); each boutique fills in only the
// numbers (vendor_size_charts). See migration 20261016130000_size_charts.sql.

export interface ChartMeasurement {
  key: string;
  name: string;
  hint: string;
  // AllBoutiqs' own standard numbers per size (optional).
  values: Record<string, string>;
}

export interface SizeChartTemplate {
  id: string;
  category_id: string | null;
  name: string;
  unit: "in" | "cm";
  sizes: string[];
  measurements: ChartMeasurement[];
}

// A boutique's numbers: { measurementKey: { size: "34" } }
export type ChartValues = Record<string, Record<string, string>>;

export const unitLabel = (unit: string) => (unit === "cm" ? "centimetres (cm)" : "inches");

export function parseTemplate(row: any): SizeChartTemplate {
  const measurements = Array.isArray(row?.measurements) ? row.measurements : [];
  return {
    id: row.id,
    category_id: row.category_id ?? null,
    name: row.name ?? "",
    unit: row.unit === "cm" ? "cm" : "in",
    sizes: Array.isArray(row?.sizes) ? row.sizes.map(String) : [],
    measurements: measurements.map((m: any, i: number) => ({
      key: String(m.key ?? m.name ?? `m${i}`),
      name: String(m.name ?? m.key ?? ""),
      hint: String(m.hint ?? ""),
      values: m.values && typeof m.values === "object" ? m.values : {},
    })),
  };
}

// Client, 2026-11-13: every category's chart is Bust, Waist and Hip, XS to
// 6XL, starting from these numbers (inches); other measurements are hidden.
// While true, the per-category templates (size_guides) only give the chart
// its name, every category has a chart (even without a template), and
// Admin > Categories hides the template editor. A boutique's numbers for
// other measurements stay saved, just not shown.
export const SIZE_CHART_STANDARD_ONLY = true;

export const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];
const STANDARD_ROWS: { key: string; name: string; hint: string; from: number }[] = [
  { key: "bust", name: "Bust", hint: "Around the fullest part of the chest, tape level", from: 32 },
  { key: "waist", name: "Waist", hint: "Around the natural waist, the narrowest part", from: 26 },
  { key: "hip", name: "Hip", hint: "Around the fullest part of the hips", from: 36 },
];

// The standard chart for a category: 2 inches up per size from XS.
export function standardTemplate(categoryId: string | null, name: string): SizeChartTemplate {
  return {
    id: `standard-${categoryId ?? "none"}`,
    category_id: categoryId,
    name,
    unit: "in",
    sizes: STANDARD_SIZES,
    measurements: STANDARD_ROWS.map((r) => ({
      key: r.key,
      name: r.name,
      hint: r.hint,
      values: Object.fromEntries(STANDARD_SIZES.map((size, i) => [size, String(r.from + i * 2)])),
    })),
  };
}

// The chart to use for a category: its template, or the standard one.
export function chartFor(template: SizeChartTemplate | null, categoryId: string, categoryName: string): SizeChartTemplate | null {
  if (SIZE_CHART_STANDARD_ONLY) return standardTemplate(categoryId, template?.name || categoryName);
  return template;
}

export const hasAnyValue = (values: ChartValues | null | undefined) =>
  !!values && Object.values(values).some((row) => Object.values(row ?? {}).some((v) => String(v ?? "").trim()));

export const standardValues = (t: SizeChartTemplate): ChartValues =>
  Object.fromEntries(t.measurements.map((m) => [m.key, m.values ?? {}]));

// The category's own template (what admins edit).
export async function fetchTemplate(categoryId: string): Promise<SizeChartTemplate | null> {
  const { data } = await supabase.from("size_guides").select("*").eq("category_id", categoryId).maybeSingle();
  return data ? parseTemplate(data) : null;
}

// The chart shoppers and boutiques see for a category (see chartFor).
export async function fetchChart(categoryId: string): Promise<SizeChartTemplate | null> {
  if (!SIZE_CHART_STANDARD_ONLY) return fetchTemplate(categoryId);
  const [template, { data: category }] = await Promise.all([
    fetchTemplate(categoryId),
    supabase.from("categories").select("name").eq("id", categoryId).maybeSingle(),
  ]);
  return chartFor(template, categoryId, category?.name ?? "Size chart");
}

export async function fetchVendorChart(vendorId: string, categoryId: string): Promise<ChartValues | null> {
  const { data } = await supabase
    .from("vendor_size_charts")
    .select("values")
    .eq("vendor_id", vendorId)
    .eq("category_id", categoryId)
    .maybeSingle();
  return (data?.values as ChartValues) ?? null;
}

// A size cell: digits and one dot, at most 6 characters (e.g. "36.5").
export const cleanNumber = (s: string) => s.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 6);

// Stable key for a new measurement name ("Skirt length" -> "skirt_length").
export const keyFor = (name: string, taken: string[]) => {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "measurement";
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
};
