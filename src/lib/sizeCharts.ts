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

export const hasAnyValue = (values: ChartValues | null | undefined) =>
  !!values && Object.values(values).some((row) => Object.values(row ?? {}).some((v) => String(v ?? "").trim()));

export const standardValues = (t: SizeChartTemplate): ChartValues =>
  Object.fromEntries(t.measurements.map((m) => [m.key, m.values ?? {}]));

export async function fetchTemplate(categoryId: string): Promise<SizeChartTemplate | null> {
  const { data } = await supabase.from("size_guides").select("*").eq("category_id", categoryId).maybeSingle();
  return data ? parseTemplate(data) : null;
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
