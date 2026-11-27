// The body measurements AllBoutiqs uses everywhere, in inches: the rows of
// every size chart (with AllBoutiqs' starting numbers per size) and the boxes
// a customer fills in for a piece made to their measurements.
//
// One list for every category (decided 27 Nov 2026; client corrections Box 3
// had it per group). It keeps the measurements the customiser already had
// and adds Neck depth and Heel height. On a lehenga "Top / dress length"
// reads "Top Length".
//
// key is stored on orders and in boutiques' charts - never rename one.

export interface BodyMeasurement {
  key: string;
  label: string;
  // "How to measure", shown to customers and boutiques.
  hint: string;
  // What a customer may enter, in inches.
  min: number;
  max: number;
  // Needed for a piece made to the customer's measurements.
  required?: boolean;
  // AllBoutiqs' starting chart number for XS, and how much it grows per size.
  chartFrom: number;
  chartStep: number;
}

export const BODY_MEASUREMENTS: BodyMeasurement[] = [
  { key: "bust", label: "Bust", hint: "Around the fullest part of the chest, tape level", min: 20, max: 60, required: true, chartFrom: 32, chartStep: 2 },
  { key: "waist", label: "Waist", hint: "Around the natural waist, the narrowest part", min: 18, max: 60, required: true, chartFrom: 26, chartStep: 2 },
  { key: "hip", label: "Hip", hint: "Around the fullest part of the hips", min: 24, max: 70, required: true, chartFrom: 36, chartStep: 2 },
  { key: "shoulder", label: "Shoulder", hint: "Across the back, from one shoulder edge to the other", min: 10, max: 24, chartFrom: 13.5, chartStep: 0.5 },
  { key: "sleeve_length", label: "Sleeve length", hint: "From the shoulder edge down to where the sleeve should end", min: 1, max: 30, chartFrom: 17, chartStep: 0.25 },
  { key: "armhole", label: "Armhole", hint: "Around the arm where it joins the shoulder", min: 10, max: 30, chartFrom: 15, chartStep: 1 },
  { key: "neck_depth", label: "Neck depth", hint: "From the base of the neck at the shoulder, straight down to where the front neckline should end", min: 2, max: 15, chartFrom: 6, chartStep: 0.25 },
  { key: "length", label: "Top / dress length", hint: "From the highest point of the shoulder down to where it should end", min: 8, max: 65, chartFrom: 40, chartStep: 0.5 },
  { key: "bottom_length", label: "Bottom length", hint: "From the waist down to where the bottom should end", min: 10, max: 50, chartFrom: 38, chartStep: 0.25 },
  { key: "heel_height", label: "Heel height", hint: "Height of the heels you'll wear with it - 0 for flats", min: 0, max: 8, chartFrom: 2, chartStep: 0 },
];

// Lehenga, Lehenga Set, Bridal Lehenga, Lehenga Saree (by name or slug).
export const isLehengaCategory = (nameOrSlug: string | null | undefined) => /lehenga/i.test(nameOrSlug ?? "");

// The list for a category: a lehenga's top is its blouse / choli.
export function bodyMeasurementsFor(category: string | null | undefined): BodyMeasurement[] {
  if (!isLehengaCategory(category)) return BODY_MEASUREMENTS;
  return BODY_MEASUREMENTS.map((m) =>
    m.key === "length"
      ? { ...m, label: "Top Length", hint: "From the highest point of the shoulder down to where the top should end", max: 30, chartFrom: 14 }
      : m,
  );
}

// AllBoutiqs' starting chart number for the size at sizeIndex (XS = 0).
export const chartNumber = (m: BodyMeasurement, sizeIndex: number) =>
  String(Math.round((m.chartFrom + sizeIndex * m.chartStep) * 100) / 100);

// Why a customer's entry won't do (null = fine): a required box left empty,
// or a number outside the measurement's range.
export function measurementError(m: BodyMeasurement, raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return m.required ? `Enter your ${m.label.toLowerCase()}` : null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < m.min || n > m.max) return `Enter ${m.min}–${m.max} in`;
  return null;
}

// Digits and one dot, at most 5 characters (e.g. "36.5").
export const cleanMeasurement = (s: string) => s.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 5);
