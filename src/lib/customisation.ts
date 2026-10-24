import { formatINR } from "@/lib/format";
// Product customisation: made to the customer's measurements and/or with
// extra options, each with its own price added to the product's. The
// boutique sets it up per product; the order line keeps a snapshot priced by
// the server (enforce_order_item_customisation) - see migration
// 20261015110000_product_customisation.sql.

// Hidden for now (2026-10-15) - the whole feature is built and kept, just
// switched off in the storefront and the product forms. Set to true to bring
// it back.
export const CUSTOMISATION_ENABLED = false;

export interface CustomisationOption {
  id: string;
  label: string;
  price: number;
}

// What a product offers.
export interface ProductCustomisationSetup {
  customisable: boolean;
  custom_size_price: number | null;
  customisation_options: CustomisationOption[];
  customisation_days: number | null;
}

// What the customer chose - the same shape the order line stores.
export interface CustomisationChoice {
  options: CustomisationOption[];
  custom_size: { price: number; unit: "in"; measurements: Record<string, string> } | null;
  note: string | null;
  photo_path: string | null;
  days: number;
}

export const MEASUREMENTS: { key: string; label: string; required?: boolean }[] = [
  { key: "bust", label: "Bust", required: true },
  { key: "waist", label: "Waist", required: true },
  { key: "hip", label: "Hip", required: true },
  { key: "shoulder", label: "Shoulder" },
  { key: "sleeve_length", label: "Sleeve length" },
  { key: "armhole", label: "Armhole" },
  { key: "length", label: "Top / dress length" },
  { key: "bottom_length", label: "Bottom length" },
];

export const PHOTO_BUCKET = "customisation-photos";

export const measurementLabel = (key: string) =>
  MEASUREMENTS.find((m) => m.key === key)?.label ?? key.replace(/_/g, " ");

export function readSetup(product: Partial<Record<keyof ProductCustomisationSetup, unknown>> | null | undefined): ProductCustomisationSetup {
  const options = Array.isArray(product?.customisation_options) ? (product!.customisation_options as CustomisationOption[]) : [];
  return {
    customisable: product?.customisable === true,
    custom_size_price: product?.custom_size_price == null ? null : Number(product.custom_size_price),
    customisation_options: options.map((o) => ({ id: String(o.id), label: String(o.label), price: Number(o.price) || 0 })),
    customisation_days: product?.customisation_days == null ? null : Number(product.customisation_days),
  };
}

export function customisationPrice(c: Pick<CustomisationChoice, "options" | "custom_size"> | null | undefined): number {
  if (!c) return 0;
  return c.options.reduce((s, o) => s + Number(o.price || 0), 0) + Number(c.custom_size?.price ?? 0);
}

// "Custom size · Sleeve length change" - for cart lines, invoices, emails.
export function customisationSummary(c: CustomisationChoice | null | undefined): string {
  if (!c) return "";
  return [c.custom_size ? "Custom size" : null, ...c.options.map((o) => o.label)].filter(Boolean).join(" · ") || "Customised";
}

export const inr = (n: number) => `${formatINR(Number(n))}`;

export const newOptionId = () => crypto.randomUUID().slice(0, 8);
