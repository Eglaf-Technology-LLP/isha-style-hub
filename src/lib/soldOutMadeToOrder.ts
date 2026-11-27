import { formatINR } from "@/lib/format";
import { CUSTOMISATION_PCTS, customisationCharge } from "@/lib/customisation";

// "When a size sells out" on Ready to Ship products (client corrections
// FINAL v3, 15 Nov 2026: 3.2 point 4 and the Part 4 list; rules agreed on
// 20 Nov 2026). The boutique picks, per product:
//   null            a sold-out size shows as sold out (the default)
//   "hide"          a sold-out size is left off the product page
//   "made_to_order" a sold-out size can still be ordered and the boutique
//                   makes it: an extra charge (a fixed ₹ or a % of the
//                   piece's price, GST included) and extra days on top of
//                   the dispatch days. No Cash on Delivery for it.
// The server decides each order line and prices it
// (supabase/migrations/20261118105000_sold_out_made_to_order.sql); this
// file only shows the same numbers before the order.

export type SoldOutAction = "made_to_order" | "hide";

// Client's Part 4 list: extra ₹ for a sold-out size made to order.
export const SOLD_OUT_EXTRA_AMOUNTS = [
  0, 100, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 4000, 5000, 7000, 10000, 15000, 20000, 30000, 40000, 50000,
] as const;
// Or a % of the piece's price - the same steps as the customisation charge.
export const SOLD_OUT_EXTRA_PCTS = CUSTOMISATION_PCTS;
// "Extra days as Making days" (Part 4): the Making days list.
export const SOLD_OUT_EXTRA_DAYS = [3, 5, 7, 10, 12, 15, 20, 25, 30, 45, 60, 75, 90] as const;

// Most of one made-to-order line the customer can pick at once.
export const MADE_TO_ORDER_MAX_QUANTITY = 10;

export interface SoldOutSetup {
  action: SoldOutAction | null;
  extraAmount: number | null;
  extraPct: number | null;
  extraDays: number | null;
}

export const NO_SOLD_OUT_SETUP: SoldOutSetup = { action: null, extraAmount: null, extraPct: null, extraDays: null };

export type ProductSoldOutFields = {
  made_to_order?: boolean | null;
  sold_out_action?: string | null;
  sold_out_extra_amount?: number | string | null;
  sold_out_extra_pct?: number | string | null;
  sold_out_extra_days?: number | string | null;
};

const num = (v: number | string | null | undefined) => (v == null || v === "" ? null : Number(v));

// A product's set-up. A Made to Order listing has no stock to run out of.
export function readSoldOutSetup(p: ProductSoldOutFields | null | undefined): SoldOutSetup {
  if (!p || p.made_to_order) return NO_SOLD_OUT_SETUP;
  const action = p.sold_out_action === "made_to_order" || p.sold_out_action === "hide" ? p.sold_out_action : null;
  return {
    action,
    extraAmount: num(p.sold_out_extra_amount),
    extraPct: num(p.sold_out_extra_pct),
    extraDays: num(p.sold_out_extra_days),
  };
}

export const takesSoldOutOrders = (s: SoldOutSetup) => s.action === "made_to_order" && s.extraDays != null;

// What a cart line made to order keeps: its charge per piece and the extra
// days, as shown to the customer. The server works them out again.
export interface SoldOutTerms {
  extra: number;
  days: number;
  pct: number | null;
}

// The extra charge for one piece at this price (whole rupees for a %, as
// the server rounds it).
export function soldOutExtra(s: SoldOutSetup, piecePrice: number): number {
  if (s.extraPct) return customisationCharge(piecePrice, s.extraPct);
  return s.extraAmount ?? 0;
}

export function soldOutTermsFor(s: SoldOutSetup, piecePrice: number): SoldOutTerms | null {
  if (!takesSoldOutOrders(s)) return null;
  return { extra: soldOutExtra(s, piecePrice), days: s.extraDays!, pct: s.extraPct };
}

// "+₹210 (10%)" / "+₹700" / "no extra charge"
export function soldOutChargeLabel(t: Pick<SoldOutTerms, "extra" | "pct">): string {
  if (!t.extra) return "no extra charge";
  return `+${formatINR(t.extra)}${t.pct ? ` (${t.pct}%)` : ""}`;
}

// Total days before it ships from the boutique: dispatch days + extra days.
export const madeToOrderDays = (dispatchDays: number, t: Pick<SoldOutTerms, "days">) => dispatchDays + t.days;

// The line the customer sees on the product page, cart and checkout.
// "Made to order · +₹210 (10%) · ships in 12 days"
export function madeToOrderLine(t: SoldOutTerms, dispatchDays?: number | null): string {
  return [
    "Made to order",
    soldOutChargeLabel(t),
    dispatchDays != null ? `ships in ${madeToOrderDays(dispatchDays, t)} days` : `${t.days} extra days to make`,
  ].join(" · ");
}

// For the boutique, admin and warehouse: what the order line says.
export function readSoldOutTerms(raw: unknown): SoldOutTerms | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const days = Number(t.days);
  if (!Number.isFinite(days)) return null;
  const pct = t.pct == null ? null : Number(t.pct);
  return { extra: Number(t.extra ?? 0) || 0, days, pct: Number.isFinite(pct) ? pct : null };
}
