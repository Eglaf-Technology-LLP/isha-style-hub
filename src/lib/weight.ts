// Parcel and product weights are stored in grams (products.weight_grams) or
// kilograms (warehouse_dispatches.weight_kg, Shiprocket's unit). On screen we
// always show both, so nobody has to guess which one a number is.

export type WeightUnit = "g" | "kg";

export function formatWeight(grams: number | null | undefined): string {
  if (grams == null || !Number.isFinite(grams)) return "-";
  const g = Math.round(grams);
  const kg = Math.round(g / 10) / 100;
  return g < 1000 ? `${g} g (${kg} kg)` : `${kg} kg (${g.toLocaleString("en-IN")} g)`;
}

export const formatWeightKg = (kg: number | null | undefined) =>
  kg == null ? "-" : formatWeight(Number(kg) * 1000);
