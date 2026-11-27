import { formatINR } from "@/lib/format";
// Product customisation: made to the customer's measurements and/or with
// their note. The boutique sets it up per product: the customisation charge
// as a % of the piece's price (client corrections 15 Nov 2026, 3.3.3 /
// 2.5.1 - 1, 2, 3, 4, 5, 7, 10, 15 or 20%, in whole rupees) and the extra
// making days. The order line keeps a snapshot priced by the server
// (enforce_order_item_customisation) - see migrations
// 20261015110000_product_customisation.sql and 20261117130000_customisation_pct.sql.

// Hidden 2026-10-15, switched back on 2026-11-09. False hides it in the
// storefront and the product forms (the feature itself stays built).
export const CUSTOMISATION_ENABLED = true;

export interface CustomisationOption {
  id: string;
  label: string;
  price: number;
}

// The customisation charge choices, % of the product price.
export const CUSTOMISATION_PCTS = [1, 2, 3, 4, 5, 7, 10, 15, 20] as const;

// What a product offers.
export interface ProductCustomisationSetup {
  customisable: boolean;
  customisation_pct: number | null;
  customisation_options: CustomisationOption[];
  customisation_days: number | null;
}

// What the customer chose - the same shape the order line stores. Lines
// from before the % charge (17 Nov 2026) have no pct / charge: their price
// is in custom_size.price and the options' prices.
export interface CustomisationChoice {
  options: CustomisationOption[];
  custom_size: { price?: number; unit: "in"; measurements: Record<string, string> } | null;
  note: string | null;
  photo_path: string | null;
  days: number;
  pct?: number | null;
  charge?: number | null;
}

// The charge for a piece at `price` (GST included): pct % of it, in whole
// rupees - the database's round(price * pct / 100).
export function customisationCharge(price: number, pct: number | null | undefined): number {
  if (!pct || !Number.isFinite(price) || price <= 0) return 0;
  return Math.round(Number(((price * pct) / 100).toFixed(4)));
}

// "+₹6,700 (10%)"
export const chargeLabel = (charge: number, pct: number | null | undefined) =>
  `+${formatINR(charge)}${pct ? ` (${pct}%)` : ""}`;

export const MEASUREMENTS: { key: string; label: string; required?: boolean }[] = [
  { key: "bust", label: "Bust", required: true },
  { key: "waist", label: "Waist", required: true },
  { key: "hip", label: "Hip", required: true },
  { key: "shoulder", label: "Shoulder" },
  { key: "sleeve_length", label: "Sleeve length" },
  { key: "armhole", label: "Armhole" },
  { key: "length", label: "Top Length" },
  { key: "bottom_length", label: "Bottom length" },
];

export const PHOTO_BUCKET = "customisation-photos";

export const measurementLabel = (key: string) =>
  MEASUREMENTS.find((m) => m.key === key)?.label ?? key.replace(/_/g, " ");

export function readSetup(product: Partial<Record<keyof ProductCustomisationSetup, unknown>> | null | undefined): ProductCustomisationSetup {
  const options = Array.isArray(product?.customisation_options) ? (product!.customisation_options as CustomisationOption[]) : [];
  return {
    customisable: product?.customisable === true && product?.customisation_pct != null,
    customisation_pct: product?.customisation_pct == null ? null : Number(product.customisation_pct),
    customisation_options: options.map((o) => ({ id: String(o.id), label: String(o.label), price: Number(o.price) || 0 })),
    customisation_days: product?.customisation_days == null ? null : Number(product.customisation_days),
  };
}

export function customisationPrice(c: Pick<CustomisationChoice, "options" | "custom_size" | "charge"> | null | undefined): number {
  if (!c) return 0;
  if (c.charge != null) return Number(c.charge);
  return c.options.reduce((s, o) => s + Number(o.price || 0), 0) + Number(c.custom_size?.price ?? 0);
}

// The same choice on a piece at another price (another size, or today's
// price): a % charge follows the price, an old ₹ one stays as it was.
export function rechargeAt(c: CustomisationChoice, price: number): CustomisationChoice {
  return c.pct ? { ...c, charge: customisationCharge(price, c.pct) } : c;
}

// "Custom size · Sleeve length change" - for cart lines, invoices, emails.
export function customisationSummary(c: CustomisationChoice | null | undefined): string {
  if (!c) return "";
  return [c.custom_size ? "Custom size" : null, ...c.options.map((o) => o.label)].filter(Boolean).join(" · ") || "Customised";
}

export const inr = (n: number) => `${formatINR(Number(n))}`;

export const newOptionId = () => crypto.randomUUID().slice(0, 8);
