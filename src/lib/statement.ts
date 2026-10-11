import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

// Statement & tax download (Payouts > Download Statement): periods,
// filters, the per-order lines (public.statement_lines) and the summaries
// built from them - monthly GST / GST TCS / TDS and quarterly TDS.

export type StatementLine = Database["public"]["Functions"]["statement_lines"]["Returns"][number];

export type PeriodKind = "daily" | "weekly" | "monthly" | "yearly" | "custom";

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

export function fiscalYearOf(d: Date): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

// [from, to] (inclusive dates) for a period choice.
export function periodRange(kind: PeriodKind, value: { date?: string; month?: string; fy?: number; from?: string; to?: string }): [string, string] {
  switch (kind) {
    case "daily":
      return [value.date!, value.date!];
    case "weekly": {
      const d = new Date(value.date!);
      return [ymd(startOfWeek(d, { weekStartsOn: 1 })), ymd(endOfWeek(d, { weekStartsOn: 1 }))];
    }
    case "monthly": {
      const d = new Date(`${value.month}-01`);
      return [ymd(startOfMonth(d)), ymd(endOfMonth(d))];
    }
    case "yearly":
      return [`${value.fy}-04-01`, `${value.fy! + 1}-03-31`];
    case "custom":
      return [value.from!, value.to!];
  }
}

export type OrderFilter = "all" | "delivered" | "cancelled" | "returned" | "refunded" | "in_progress";
export type PayoutFilter = "all" | "paid" | "pending";
export type PaymentFilter = "all" | "cod" | "prepaid";

export const ORDER_FILTERS: [OrderFilter, string][] = [
  ["all", "All orders"],
  ["delivered", "Delivered"],
  ["cancelled", "Cancelled"],
  ["returned", "Returned"],
  ["refunded", "Refunded"],
  ["in_progress", "Pending (not delivered yet)"],
];
export const PAYOUT_FILTERS: [PayoutFilter, string][] = [
  ["all", "Any payout"],
  ["paid", "Paid"],
  ["pending", "Payout pending"],
];
export const PAYMENT_FILTERS: [PaymentFilter, string][] = [
  ["all", "COD & prepaid"],
  ["cod", "COD"],
  ["prepaid", "Prepaid"],
];

export function applyFilters(lines: StatementLine[], f: { order: OrderFilter; payout: PayoutFilter; payment: PaymentFilter }) {
  return lines.filter((l) => {
    const refunded = Number(l.refunded) > 0;
    if (f.order === "delivered" && l.status !== "delivered") return false;
    if (f.order === "cancelled" && l.status !== "cancelled") return false;
    if (f.order === "returned" && !(l.status === "returned" || (refunded && l.status === "delivered"))) return false;
    if (f.order === "refunded" && !refunded) return false;
    if (f.order === "in_progress" && ["delivered", "cancelled", "returned"].includes(l.status)) return false;
    if (f.payout === "paid" && l.payout_status !== "paid") return false;
    if (f.payout === "pending" && l.payout_status === "paid") return false;
    if (f.payment === "cod" && l.payment_method !== "cod") return false;
    if (f.payment === "prepaid" && l.payment_method === "cod") return false;
    return true;
  });
}

const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const tcsTotal = (l: StatementLine) => n(l.tcs_cgst) + n(l.tcs_sgst) + n(l.tcs_igst);

// The order lines as they appear in the statement (Excel columns / PDF).
export function orderRows(lines: StatementLine[], withBoutique: boolean) {
  return lines.map((l) => ({
    ...(withBoutique ? { Boutique: `${l.boutique_name} (${l.boutique_code})` } : {}),
    "Order no.": l.order_number,
    "Order date": l.order_date,
    "Delivered on": l.delivered_on ?? "",
    Status: l.status,
    Payment: l.payment_method === "cod" ? "COD" : "Prepaid",
    "Product value": n(l.product_value),
    GST: n(l.gst),
    "Marketplace commission": n(l.commission),
    "Technology & service fee": n(l.tech_fee),
    "GST on AllBoutiqs fees": n(l.fee_gst),
    "Payment gateway fee": n(l.gateway_fee),
    "Courier & logistics": n(l.courier),
    "COD handling charge": n(l.cod_charge),
    Refunded: n(l.refunded),
    "Net taxable (after returns)": n(l.net_taxable),
    "GST TCS": r2(tcsTotal(l)),
    "Income-tax TDS": n(l.tds),
    "Net payout": n(l.net_payout),
    "Payout status": l.payout_status,
    "Payment date": l.payment_date ?? "",
    UTR: l.utr ?? "",
    "Fee invoice": l.fee_invoice_number ?? "",
  }));
}

// Month-wise totals for filing GST: GST on sales, GST TCS split, TDS.
export function monthlyGstRows(lines: StatementLine[], withBoutique: boolean) {
  const groups = new Map<string, StatementLine[]>();
  for (const l of lines) {
    const key = `${withBoutique ? `${l.boutique_name} (${l.boutique_code})|` : ""}${l.order_date.slice(0, 7)}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  return [...groups.entries()].sort().map(([key, ls]) => {
    const [boutique, month] = withBoutique ? key.split("|") : [null, key];
    return {
      ...(withBoutique ? { Boutique: boutique } : {}),
      Month: format(new Date(`${month}-01`), "MMM yyyy"),
      Orders: ls.length,
      "Product value": r2(ls.reduce((s, l) => s + n(l.product_value), 0)),
      "GST on sales": r2(ls.reduce((s, l) => s + n(l.gst), 0)),
      "Net taxable (after returns)": r2(ls.reduce((s, l) => s + n(l.net_taxable), 0)),
      "GST TCS - CGST": r2(ls.reduce((s, l) => s + n(l.tcs_cgst), 0)),
      "GST TCS - SGST": r2(ls.reduce((s, l) => s + n(l.tcs_sgst), 0)),
      "GST TCS - IGST": r2(ls.reduce((s, l) => s + n(l.tcs_igst), 0)),
      "GST TCS total": r2(ls.reduce((s, l) => s + tcsTotal(l), 0)),
      "Income-tax TDS": r2(ls.reduce((s, l) => s + n(l.tds), 0)),
    };
  });
}

// Financial-year quarters (Q1 Apr-Jun ... Q4 Jan-Mar) for TDS.
export function quarterlyTdsRows(lines: StatementLine[], withBoutique: boolean) {
  const label = (d: string) => {
    const date = new Date(d);
    const fy = fiscalYearOf(date);
    const q = Math.floor(((date.getMonth() + 9) % 12) / 3) + 1;
    return `FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")} Q${q}`;
  };
  const groups = new Map<string, StatementLine[]>();
  for (const l of lines) {
    const key = `${withBoutique ? `${l.boutique_name} (${l.boutique_code})|` : ""}${label(l.order_date)}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  return [...groups.entries()].sort().map(([key, ls]) => {
    const [boutique, quarter] = withBoutique ? key.split("|") : [null, key];
    return {
      ...(withBoutique ? { Boutique: boutique } : {}),
      Quarter: quarter,
      Orders: ls.length,
      "Product value": r2(ls.reduce((s, l) => s + n(l.product_value), 0)),
      "TDS rates": [...new Set(ls.map((l) => `${n(l.tds_rate)}%`))].join(", "),
      "Income-tax TDS": r2(ls.reduce((s, l) => s + n(l.tds), 0)),
    };
  });
}

export function totals(lines: StatementLine[]) {
  const sum = (k: keyof StatementLine) => r2(lines.reduce((s, l) => s + n(l[k]), 0));
  return {
    orders: lines.length,
    productValue: sum("product_value"),
    gst: sum("gst"),
    fees: r2(sum("commission") + sum("tech_fee") + sum("fee_gst")),
    gateway: sum("gateway_fee"),
    tcs: r2(sum("tcs_cgst") + sum("tcs_sgst") + sum("tcs_igst")),
    tds: sum("tds"),
    payout: sum("net_payout"),
  };
}
