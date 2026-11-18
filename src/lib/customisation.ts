import { formatINR } from './format';

// Product customisation: a piece made to the customer's measurements and/or
// with their note - the website's src/lib/customisation.ts (Live-Vendor).
// The boutique sets it per product: the charge as a % of the piece's price
// (1, 2, 3, 4, 5, 7, 10, 15 or 20%, in whole rupees) and the extra making
// days. The server prices the order line itself
// (enforce_order_item_customisation, migration 20261117130000) and marks it
// not returnable; the app only shows the same sums.
//
// As on the website today: no priced extra options and no reference photo
// (both hidden there), just "Make it to my measurements" and a note.

export interface CustomisationOption {
  id: string;
  label: string;
  price: number;
}

// What a product offers.
export interface ProductCustomisationSetup {
  customisable: boolean;
  customisation_pct: number | null;
  customisation_days: number | null;
}

// What the customer chose - the same shape the order line stores. Lines
// from before the % charge (17 Nov 2026) have no pct / charge: their price
// is in custom_size.price and the options' prices.
export interface CustomisationChoice {
  options: CustomisationOption[];
  custom_size: {
    price?: number;
    unit: 'in';
    measurements: Record<string, string>;
  } | null;
  note: string | null;
  photo_path: string | null;
  days: number;
  pct?: number | null;
  charge?: number | null;
}

// The charge for a piece at `price` (GST included): pct % of it, in whole
// rupees - the database's round(price * pct / 100).
export function customisationCharge(
  price: number,
  pct: number | null | undefined,
): number {
  if (!pct || !Number.isFinite(price) || price <= 0) return 0;
  return Math.round(Number(((price * pct) / 100).toFixed(4)));
}

// "+₹6,700 (10%)"
export const chargeLabel = (charge: number, pct: number | null | undefined) =>
  `+${formatINR(charge)}${pct ? ` (${pct}%)` : ''}`;

export const MEASUREMENTS: {
  key: string;
  label: string;
  required?: boolean;
}[] = [
  { key: 'bust', label: 'Bust', required: true },
  { key: 'waist', label: 'Waist', required: true },
  { key: 'hip', label: 'Hip', required: true },
  { key: 'shoulder', label: 'Shoulder' },
  { key: 'sleeve_length', label: 'Sleeve length' },
  { key: 'armhole', label: 'Armhole' },
  { key: 'length', label: 'Top / dress length' },
  { key: 'bottom_length', label: 'Bottom length' },
];

export const measurementLabel = (key: string) =>
  MEASUREMENTS.find(m => m.key === key)?.label ?? key.replace(/_/g, ' ');

// A product row's set-up. Customisable only with a % set (the database
// refuses a customisable product without one).
export function readSetup(
  product: Record<string, unknown> | null | undefined,
): ProductCustomisationSetup {
  return {
    customisable:
      product?.customisable === true && product?.customisation_pct != null,
    customisation_pct:
      product?.customisation_pct == null
        ? null
        : Number(product.customisation_pct),
    customisation_days:
      product?.customisation_days == null
        ? null
        : Number(product.customisation_days),
  };
}

// What the customisation adds to one piece.
export function customisationPrice(
  c:
    | Pick<CustomisationChoice, 'options' | 'custom_size' | 'charge'>
    | null
    | undefined,
): number {
  if (!c) return 0;
  if (c.charge != null) return Number(c.charge);
  return (
    (c.options ?? []).reduce((s, o) => s + Number(o.price || 0), 0) +
    Number(c.custom_size?.price ?? 0)
  );
}

// The same choice on a piece at another price (another size): a % charge
// follows the price, an old ₹ one stays as it was.
export function rechargeAt(
  c: CustomisationChoice,
  price: number,
): CustomisationChoice {
  return c.pct ? { ...c, charge: customisationCharge(price, c.pct) } : c;
}

// "Custom size · Sleeve length change" - for bag lines and orders.
export function customisationSummary(
  c: CustomisationChoice | null | undefined,
): string {
  if (!c) return '';
  return (
    [
      c.custom_size ? 'Custom size' : null,
      ...(c.options ?? []).map(o => o.label),
    ]
      .filter(Boolean)
      .join(' · ') || 'Customised'
  );
}

// ---------- the product page's panel ----------

export interface CustomiserState {
  enabled: boolean;
  customSize: boolean;
  measurements: Record<string, string>;
  note: string;
}

export const emptyCustomiser: CustomiserState = {
  enabled: false,
  customSize: false,
  measurements: {},
  note: '',
};

// The customer's choice for the bag (priced on the piece's `price`), or
// what's missing - the website's buildCustomisation, word for word.
export function buildCustomisation(
  setup: ProductCustomisationSetup,
  s: CustomiserState,
  price: number,
): { choice: CustomisationChoice | null } | { error: string } {
  if (!setup.customisable || !s.enabled) return { choice: null };
  let custom_size: CustomisationChoice['custom_size'] = null;
  if (s.customSize) {
    const missing = MEASUREMENTS.filter(
      m => m.required && !String(s.measurements[m.key] ?? '').trim(),
    );
    if (missing.length)
      return {
        error: `Please enter your ${missing
          .map(m => m.label.toLowerCase())
          .join(', ')}`,
      };
    const measurements = Object.fromEntries(
      Object.entries(s.measurements)
        .filter(([, v]) => String(v).trim())
        .map(([k, v]) => [k, String(v).trim()]),
    );
    custom_size = { unit: 'in', measurements };
  }
  const note = s.note.trim() || null;
  if (!custom_size && !note) {
    return {
      error:
        'Enter your measurements or tell us what to change, or switch customisation off',
    };
  }
  return {
    choice: {
      options: [],
      custom_size,
      note,
      photo_path: null,
      days: setup.customisation_days ?? 0,
      pct: setup.customisation_pct,
      charge: customisationCharge(price, setup.customisation_pct),
    },
  };
}

// What the order line sends: the server rebuilds and prices the rest from
// the product (as the website's checkout).
export const customisationForOrder = (
  c: CustomisationChoice | null | undefined,
) =>
  c
    ? {
        options: (c.options ?? []).map(o => ({ id: o.id })),
        custom_size: c.custom_size
          ? { measurements: c.custom_size.measurements }
          : null,
        note: c.note,
        photo_path: c.photo_path,
      }
    : null;
