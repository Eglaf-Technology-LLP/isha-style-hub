import { formatINR } from './format';
import { customisationCharge } from './customisation';

// "When a size sells out" on Ready to Ship products - the same rules as the
// website's src/lib/soldOutMadeToOrder.ts (client corrections FINAL v3,
// 3.2 point 4; rules agreed on 20 Nov 2026). The boutique picks, per product:
//   null            a sold-out size shows as sold out (the default)
//   "hide"          a sold-out size is left off the product page
//   "made_to_order" a sold-out size can still be ordered and the boutique
//                   makes it: an extra charge (a fixed ₹ or a % of the
//                   piece's price, GST included) and extra days on top of
//                   the dispatch days. No Cash on Delivery for it.
// The server decides each order line and prices it
// (supabase/migrations/20261118105000_sold_out_made_to_order.sql); this
// file only shows the same numbers before the order.

export type SoldOutAction = 'made_to_order' | 'hide';

// Most of one made-to-order line the customer can pick at once.
export const MADE_TO_ORDER_MAX_QUANTITY = 10;

export interface SoldOutSetup {
  action: SoldOutAction | null;
  extraAmount: number | null;
  extraPct: number | null;
  extraDays: number | null;
}

export const NO_SOLD_OUT_SETUP: SoldOutSetup = {
  action: null,
  extraAmount: null,
  extraPct: null,
  extraDays: null,
};

type ProductSoldOutFields = {
  made_to_order?: boolean | null;
  sold_out_action?: string | null;
  sold_out_extra_amount?: number | string | null;
  sold_out_extra_pct?: number | string | null;
  sold_out_extra_days?: number | string | null;
};

const num = (v: number | string | null | undefined) =>
  v == null || v === '' ? null : Number(v);

// A product's set-up. A Made to Order listing has no stock to run out of.
export function readSoldOutSetup(
  p: ProductSoldOutFields | null | undefined,
): SoldOutSetup {
  if (!p || p.made_to_order) return NO_SOLD_OUT_SETUP;
  const action =
    p.sold_out_action === 'made_to_order' || p.sold_out_action === 'hide'
      ? p.sold_out_action
      : null;
  return {
    action,
    extraAmount: num(p.sold_out_extra_amount),
    extraPct: num(p.sold_out_extra_pct),
    extraDays: num(p.sold_out_extra_days),
  };
}

export const takesSoldOutOrders = (s: SoldOutSetup) =>
  s.action === 'made_to_order' && s.extraDays != null;

// What a bag line made to order keeps: its charge per piece and the extra
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

export function soldOutTermsFor(
  s: SoldOutSetup,
  piecePrice: number,
): SoldOutTerms | null {
  if (!takesSoldOutOrders(s)) return null;
  return {
    extra: soldOutExtra(s, piecePrice),
    days: s.extraDays!,
    pct: s.extraPct,
  };
}

// "+₹210 (10%)" / "+₹700" / "no extra charge"
export function soldOutChargeLabel(
  t: Pick<SoldOutTerms, 'extra' | 'pct'>,
): string {
  if (!t.extra) return 'no extra charge';
  return `+${formatINR(t.extra)}${t.pct ? ` (${t.pct}%)` : ''}`;
}

// Total days before it ships from the boutique: dispatch days + extra days.
export const madeToOrderDays = (
  dispatchDays: number,
  t: Pick<SoldOutTerms, 'days'>,
) => dispatchDays + t.days;

// "Made to order · +₹210 (10%) · ships in 12 days"
export function madeToOrderLine(
  t: SoldOutTerms,
  dispatchDays?: number | null,
): string {
  return [
    'Made to order',
    soldOutChargeLabel(t),
    dispatchDays != null
      ? `ships in ${madeToOrderDays(dispatchDays, t)} days`
      : `${t.days} extra days to make`,
  ].join(' · ');
}

// The cart / checkout note for a sold-out size made to order (the website's
// MadeToOrderLineNote).
export const madeToOrderLineNote = (t: SoldOutTerms) =>
  `This size is sold out, so the boutique makes it for you · ${soldOutChargeLabel(
    t,
  )} per piece · ${t.days} extra days · no Cash on Delivery`;

// What an order line says (the website's MadeToOrderBadge, customer side).
export function madeToOrderOrderNote(
  madeToOrder: boolean | null | undefined,
  soldOutTerms: unknown,
): string | null {
  if (!madeToOrder) return null;
  const t = readSoldOutTerms(soldOutTerms);
  return t
    ? `Size was sold out · ${soldOutChargeLabel(t)} per piece · ${
        t.days
      } extra days`
    : 'Made for you after you order';
}

// An order line's saved terms.
export function readSoldOutTerms(raw: unknown): SoldOutTerms | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const days = Number(t.days);
  if (!Number.isFinite(days)) return null;
  const pct = t.pct == null ? null : Number(t.pct);
  return {
    extra: Number(t.extra ?? 0) || 0,
    days,
    pct: pct != null && Number.isFinite(pct) ? pct : null,
  };
}
