import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";
import { COMPANY } from "@/lib/company";
import type { StatementLine } from "@/lib/statement";

// The tax reports in Download Statement, built from the same records for the
// boutique and for AllBoutiqs so both sides always show the same numbers:
//   * the boutique's GSTR-1 (sales register, B2CS, B2CL, credit notes,
//     CDNUR, HSN summary, documents issued, Table 14 - supplies through
//     AllBoutiqs) from its customer tax invoices and credit notes, by their
//     dates; B2CS, HSN and Table 14 are net of credit notes;
//   * its ITC register from AllBoutiqs' fee invoices - commission,
//     technology fee, courier & logistics charge (= AllBoutiqs' GSTR-1 B2B);
//   * GST TCS per boutique GSTIN and month (= AllBoutiqs' GSTR-8) by
//     document date, each document adding up to the TCS deducted;
//   * payouts: each bank transfer with what its orders add up to;
//   * checks: every money equality with its difference (money_checks).
//   * AllBoutiqs only: its invoices to customers (COD charge, shipping) and an
//     order-by-order check that what the customer paid = boutique goods +
//     shipping + COD charge, and that each boutique part's goods = fees +
//     taxes + payout.

type Tables = Database["public"]["Tables"];
export type SalesInvoice = Tables["invoices"]["Row"] & { invoice_lines: Tables["invoice_lines"]["Row"][] };
export type FeeInvoice = Tables["fee_invoices"]["Row"];
export type CourierInvoice = Tables["platform_invoices"]["Row"];
export type CreditNote = Tables["credit_notes"]["Row"] & { credit_note_lines: Tables["credit_note_lines"]["Row"][] };
export type TcsDocLine = Database["public"]["Functions"]["tcs_document_lines"]["Returns"][number];
export type MoneyCheck = Database["public"]["Functions"]["money_checks"]["Returns"][number];

const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const sum = <T>(rows: T[], f: (r: T) => number) => r2(rows.reduce((s, r) => s + f(r), 0));
const day = (iso: string) => format(new Date(iso), "yyyy-MM-dd");

// GSTR-1: inter-state invoices to unregistered buyers above this go to B2CL.
export const B2CL_LIMIT = 100000;

// "27-Maharashtra", as the GST portal writes a place of supply.
const pos = (code: string | null | undefined, state: string | null | undefined) =>
  code ? `${code}-${state ?? ""}` : state ?? "";

const isB2cl = (i: SalesInvoice) => i.supply_type === "inter_state" && n(i.total) > B2CL_LIMIT;
const isB2clCreditNote = (c: CreditNote) => c.supply_type === "inter_state" && n(c.invoice_total) > B2CL_LIMIT;

function groupBy<T>(rows: T[], key: (r: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const boutiqueOf = (i: { seller_name: string; seller_gstin: string | null }) => `${i.seller_name} (${i.seller_gstin ?? "no GSTIN"})`;

// ---------- the boutique's GSTR-1 ----------

export function salesRegisterRows(invoices: SalesInvoice[], withBoutique: boolean) {
  return invoices.flatMap((i) =>
    i.invoice_lines
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) => ({
        ...(withBoutique ? { Boutique: boutiqueOf(i) } : {}),
        "Invoice no.": i.invoice_number,
        "Invoice date": day(i.issued_at),
        "Order no.": i.order_number ?? "",
        "Place of supply": pos(i.place_of_supply_code, i.billing_state),
        Supply: i.supply_type === "intra_state" ? "Intra-state" : "Inter-state",
        HSN: l.hsn_code ?? "",
        Description: l.description,
        Qty: l.quantity,
        "Taxable value": n(l.taxable_value),
        "GST rate %": n(l.gst_rate),
        CGST: n(l.cgst_amount),
        SGST: n(l.sgst_amount),
        IGST: n(l.igst_amount),
        "Line total": n(l.total),
      })),
  );
}

// A line of an invoice (+) or of a credit note (-), for the tables that net
// them: B2CS, HSN summary, Table 14.
interface SignedLine {
  who: string;
  pos: string;
  sign: 1 | -1;
  l: {
    hsn_code: string | null;
    quantity: number;
    gst_rate: number;
    taxable_value: number;
    igst_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    total: number;
  };
}
const signedLines = (invoices: SalesInvoice[], creditNotes: CreditNote[]): SignedLine[] => [
  ...invoices.flatMap((i) =>
    i.invoice_lines.map((l) => ({ who: boutiqueOf(i), pos: pos(i.place_of_supply_code, i.billing_state), sign: 1 as const, l })),
  ),
  ...creditNotes.flatMap((c) =>
    c.credit_note_lines.map((l) => ({ who: boutiqueOf(c), pos: pos(c.place_of_supply_code, c.billing_state), sign: -1 as const, l })),
  ),
];
const ssum = (g: SignedLine[], f: (l: SignedLine["l"]) => number) => sum(g, (x) => x.sign * n(f(x.l)));

// B2CS: invoices less credit notes, by place of supply and rate (B2CL ones
// are reported invoice by invoice: B2CL and CDNUR).
export function b2csRows(invoices: SalesInvoice[], creditNotes: CreditNote[], withBoutique: boolean) {
  const lines = signedLines(invoices.filter((i) => !isB2cl(i)), creditNotes.filter((c) => !isB2clCreditNote(c)));
  return groupBy(lines, (x) => [withBoutique ? x.who : "", x.pos, n(x.l.gst_rate)].join("|")).map(([, g]) => ({
    ...(withBoutique ? { Boutique: g[0].who } : {}),
    Type: "E",
    "Place of supply": g[0].pos,
    "Rate %": n(g[0].l.gst_rate),
    "Taxable value": ssum(g, (l) => l.taxable_value),
    IGST: ssum(g, (l) => l.igst_amount),
    CGST: ssum(g, (l) => l.cgst_amount),
    SGST: ssum(g, (l) => l.sgst_amount),
    "E-commerce GSTIN": COMPANY.gstin,
  }));
}

export function b2clRows(invoices: SalesInvoice[], withBoutique: boolean) {
  return invoices.filter(isB2cl).flatMap((i) =>
    groupBy(i.invoice_lines, (l) => String(n(l.gst_rate))).map(([, g]) => ({
      ...(withBoutique ? { Boutique: boutiqueOf(i) } : {}),
      "Invoice no.": i.invoice_number,
      "Invoice date": day(i.issued_at),
      "Invoice value": n(i.total),
      "Place of supply": pos(i.place_of_supply_code, i.billing_state),
      "Rate %": n(g[0].gst_rate),
      "Taxable value": sum(g, (l) => n(l.taxable_value)),
      IGST: sum(g, (l) => n(l.igst_amount)),
      "E-commerce GSTIN": COMPANY.gstin,
    })),
  );
}

// Table 12, net of credit notes.
export function hsnRows(invoices: SalesInvoice[], creditNotes: CreditNote[], withBoutique: boolean) {
  const lines = signedLines(invoices, creditNotes);
  return groupBy(lines, (x) => [withBoutique ? x.who : "", x.l.hsn_code ?? "", n(x.l.gst_rate)].join("|")).map(([, g]) => ({
    ...(withBoutique ? { Boutique: g[0].who } : {}),
    HSN: g[0].l.hsn_code ?? "",
    UQC: "PCS-PIECES",
    "Total quantity": g.reduce((s, x) => s + x.sign * x.l.quantity, 0),
    "Rate %": n(g[0].l.gst_rate),
    "Total value": ssum(g, (l) => l.total),
    "Taxable value": ssum(g, (l) => l.taxable_value),
    IGST: ssum(g, (l) => l.igst_amount),
    CGST: ssum(g, (l) => l.cgst_amount),
    SGST: ssum(g, (l) => l.sgst_amount),
  }));
}

// Table 13: the invoice and credit note number ranges used in the period.
export function documentsIssuedRows(invoices: SalesInvoice[], creditNotes: CreditNote[], withBoutique: boolean) {
  const docs = [
    ...invoices.map((i) => ({ who: boutiqueOf(i), kind: "Invoices for outward supply", no: i.invoice_number })),
    ...creditNotes.map((c) => ({ who: boutiqueOf(c), kind: "Credit notes", no: c.credit_note_number })),
  ];
  return groupBy(docs, (d) => `${withBoutique ? d.who : ""}|${d.kind}`).map(([, g]) => {
    const numbers = g.map((d) => d.no).sort();
    return {
      ...(withBoutique ? { Boutique: g[0].who } : {}),
      "Nature of document": g[0].kind,
      "Sr. no. from": numbers[0],
      "Sr. no. to": numbers[numbers.length - 1],
      "Total number": numbers.length,
      Cancelled: 0,
    };
  });
}

// Table 14: supplies made through an e-commerce operator that collects TCS,
// net of credit notes.
export function ecoRows(invoices: SalesInvoice[], creditNotes: CreditNote[], withBoutique: boolean) {
  const lines = signedLines(invoices, creditNotes);
  return groupBy(lines, (x) => (withBoutique ? x.who : "")).map(([, g]) => ({
    ...(withBoutique ? { Boutique: g[0].who } : {}),
    "E-commerce operator": COMPANY.legalName,
    "E-commerce GSTIN": COMPANY.gstin,
    "Net value of supplies": ssum(g, (l) => l.taxable_value),
    IGST: ssum(g, (l) => l.igst_amount),
    CGST: ssum(g, (l) => l.cgst_amount),
    SGST: ssum(g, (l) => l.sgst_amount),
  }));
}

const CN_REASON: Record<string, string> = { return: "Return", cancelled: "Cancelled", undelivered: "Not delivered (RTO)" };

// Every credit note issued in the period (by credit note date).
export function creditNoteRows(creditNotes: CreditNote[], withBoutique: boolean) {
  return creditNotes.map((c) => ({
    ...(withBoutique ? { Boutique: boutiqueOf(c) } : {}),
    "Credit note no.": c.credit_note_number,
    "Credit note date": day(c.issued_at),
    "Against invoice": c.invoice_number,
    "Invoice date": day(c.invoice_date),
    Reason: CN_REASON[c.reason] ?? c.reason,
    "Place of supply": pos(c.place_of_supply_code, c.billing_state),
    Supply: c.supply_type === "intra_state" ? "Intra-state" : "Inter-state",
    "Taxable value": n(c.taxable_value),
    CGST: n(c.cgst_amount),
    SGST: n(c.sgst_amount),
    IGST: n(c.igst_amount),
    "Credit note value": n(c.total),
  }));
}

// CDNUR: credit notes against B2CL invoices, by rate.
export function cdnurRows(creditNotes: CreditNote[], withBoutique: boolean) {
  return creditNotes.filter(isB2clCreditNote).flatMap((c) =>
    groupBy(c.credit_note_lines, (l) => String(n(l.gst_rate))).map(([, g]) => ({
      ...(withBoutique ? { Boutique: boutiqueOf(c) } : {}),
      "UR type": "B2CL",
      "Note no.": c.credit_note_number,
      "Note date": day(c.issued_at),
      "Note type": "C",
      "Place of supply": pos(c.place_of_supply_code, c.billing_state),
      "Note value": n(c.total),
      "Rate %": n(g[0].gst_rate),
      "Taxable value": sum(g, (l) => n(l.taxable_value)),
      IGST: sum(g, (l) => n(l.igst_amount)),
      "Against invoice": c.invoice_number,
    })),
  );
}

// ---------- ITC: AllBoutiqs' fee invoices ----------

export function feeInvoiceRows(fees: FeeInvoice[], withBoutique: boolean) {
  return fees.map((f) => ({
    ...(withBoutique ? { Boutique: `${f.recipient_name} (${f.recipient_gstin ?? "no GSTIN"})` } : {}),
    "Supplier GSTIN": f.supplier_gstin,
    Supplier: f.supplier_name,
    "Invoice no.": f.invoice_number,
    "Invoice date": day(f.issued_at),
    "Recipient GSTIN": f.recipient_gstin ?? "",
    "Place of supply": f.recipient_state_code ?? "",
    SAC: f.sac_code,
    Orders: f.order_count,
    "Marketplace commission": n(f.commission_amount),
    "Technology & service fee": n(f.tech_fee_amount),
    "Courier & logistics": n(f.logistics_fee_amount),
    "Courier & logistics SAC": f.logistics_sac_code ?? "",
    "Taxable value": n(f.taxable_value),
    "GST rate %": n(f.gst_rate),
    CGST: n(f.cgst_amount),
    SGST: n(f.sgst_amount),
    IGST: n(f.igst_amount),
    "Invoice value": n(f.total),
  }));
}

// ---------- GST TCS (section 52) = AllBoutiqs' GSTR-8 ----------
// By tax invoice / credit note date (the GSTR-1 dates). Each document carries
// the change in its order's TCS, so over an order's documents they add up to
// exactly the TCS taken off its payout (tcs_document_lines).

export function tcsDocumentRows(lines: TcsDocLine[], withBoutique: boolean) {
  return lines.map((l) => ({
    ...(withBoutique ? { Boutique: `${l.boutique_name} (${l.boutique_code})` } : {}),
    "Supplier GSTIN": l.gstin ?? "",
    Document: l.doc_type === "invoice" ? "Tax invoice" : "Credit note",
    "Document no.": l.doc_number,
    "Document date": l.doc_date,
    Supply: l.supply_type === "intra_state" ? "Intra-state" : "Inter-state",
    "Taxable value": n(l.taxable),
    "TCS - IGST": n(l.tcs_igst),
    "TCS - CGST": n(l.tcs_cgst),
    "TCS - SGST": n(l.tcs_sgst),
    "TCS total": r2(n(l.tcs_igst) + n(l.tcs_cgst) + n(l.tcs_sgst)),
  }));
}

// GSTR-8 by supplier and month: gross supplies (invoices), returns (credit
// notes), net and the TCS on it - the document lines added up.
export function tcsMonthlyRows(lines: TcsDocLine[], withBoutique: boolean) {
  return groupBy(lines, (l) => `${withBoutique ? l.boutique_name : ""}|${l.gstin ?? ""}|${l.doc_date.slice(0, 7)}`).map(([, g]) => {
    const gross = sum(g, (l) => (l.doc_type === "invoice" ? n(l.taxable) : 0));
    const returns = sum(g, (l) => (l.doc_type === "invoice" ? 0 : -n(l.taxable)));
    return {
      ...(withBoutique ? { Boutique: `${g[0].boutique_name} (${g[0].boutique_code})` } : {}),
      Month: format(new Date(`${g[0].doc_date.slice(0, 7)}-01`), "MMM yyyy"),
      "Supplier GSTIN": g[0].gstin ?? "",
      "Gross value of supplies": gross,
      "Value of returns": returns,
      "Net value (TCS base)": r2(gross - returns),
      "TCS - IGST": sum(g, (l) => n(l.tcs_igst)),
      "TCS - CGST": sum(g, (l) => n(l.tcs_cgst)),
      "TCS - SGST": sum(g, (l) => n(l.tcs_sgst)),
      "TCS total": sum(g, (l) => n(l.tcs_igst) + n(l.tcs_cgst) + n(l.tcs_sgst)),
      "Collected by": `${COMPANY.legalName} (${COMPANY.gstin})`,
    };
  });
}

// ---------- payouts: the bank transfers ----------

export type PayoutPart = Pick<
  Tables["vendor_orders"]["Row"],
  | "id"
  | "payout_id"
  | "goods_value"
  | "commission_amount"
  | "tech_fee_amount"
  | "logistics_fee_amount"
  | "fee_gst_amount"
  | "gateway_fee_amount"
  | "courier_charge"
  | "cod_handling_charge"
  | "shipping_to_boutique"
  | "shipping_cost"
  | "tcs_amount"
  | "tds_amount"
  | "net_payable"
  | "rzp_reversed_amount"
>;
export type PayoutTransfer = Tables["vendor_payouts"]["Row"] & { vendor_name: string; parts: PayoutPart[] };

// One row per transfer (match it with the bank statement), every amount the
// orders in it add up to, and the difference from what was transferred.
export function payoutRows(transfers: PayoutTransfer[], withBoutique: boolean) {
  return transfers.map((t) => {
    const p = t.parts;
    const ordersNet = sum(p, (x) => n(x.net_payable) - n(x.rzp_reversed_amount));
    return {
      ...(withBoutique ? { Boutique: t.vendor_name } : {}),
      "Payout date": t.payout_date ?? "",
      "Paid on": t.paid_at ? day(t.paid_at) : "",
      Status: t.status,
      "UTR / reference": t.payment_reference ?? "",
      Orders: p.length,
      "Goods (after coupon, returns)": sum(p, (x) => n(x.goods_value)),
      "Shipping credited": sum(p, (x) => (x.shipping_to_boutique ? n(x.shipping_cost) : 0)),
      "Marketplace commission": sum(p, (x) => n(x.commission_amount)),
      "Technology & service fee": sum(p, (x) => n(x.tech_fee_amount)),
      "Courier & logistics": sum(p, (x) => n(x.logistics_fee_amount)),
      "GST on AllBoutiqs fees": sum(p, (x) => n(x.fee_gst_amount)),
      "Payment gateway fee": sum(p, (x) => n(x.gateway_fee_amount)),
      "Courier cost / COD handling": sum(p, (x) => (x.shipping_to_boutique ? n(x.courier_charge) : 0) + n(x.cod_handling_charge)),
      "GST TCS": sum(p, (x) => n(x.tcs_amount)),
      "Income-tax TDS": sum(p, (x) => n(x.tds_amount)),
      "Orders' payouts": ordersNet,
      Transferred: n(t.net_payable),
      Difference: r2(n(t.net_payable) - ordersNet),
    };
  });
}

// ---------- checks ----------

export function checkRows(checks: MoneyCheck[]) {
  return checks.map((c) => ({
    Check: c.check_name,
    Boutique: c.boutique_name ?? "",
    Reference: c.reference ?? "",
    Expected: n(c.expected),
    Actual: n(c.actual),
    Difference: n(c.difference),
  }));
}

// ---------- AllBoutiqs only ----------

// AllBoutiqs' invoices to customers (its own GSTR-1, B2C): COD fee (3% + GST), shipping.
export function courierInvoiceRows(invoices: CourierInvoice[]) {
  return invoices.map((i) => ({
    "Invoice no.": i.invoice_number,
    "Invoice date": day(i.issued_at),
    "Place of supply": pos(i.place_of_supply_code, i.billing_state),
    SAC: i.sac_code,
    Shipping: n(i.shipping_amount),
    "COD fee (incl. GST)": n(i.cod_amount),
    "Taxable value": n(i.taxable_value),
    "GST rate %": n(i.gst_rate),
    CGST: n(i.cgst_amount),
    SGST: n(i.sgst_amount),
    IGST: n(i.igst_amount),
    "Invoice value": n(i.total),
  }));
}

export function courierB2csRows(invoices: CourierInvoice[]) {
  return groupBy(invoices, (i) => `${pos(i.place_of_supply_code, i.billing_state)}|${n(i.gst_rate)}`).map(([, g]) => ({
    Type: "OE",
    "Place of supply": pos(g[0].place_of_supply_code, g[0].billing_state),
    "Rate %": n(g[0].gst_rate),
    "Taxable value": sum(g, (i) => n(i.taxable_value)),
    IGST: sum(g, (i) => n(i.igst_amount)),
    CGST: sum(g, (i) => n(i.cgst_amount)),
    SGST: sum(g, (i) => n(i.sgst_amount)),
  }));
}

export interface ReconOrder {
  id: string;
  total: number;
  shipping_cost: number;
  cod_charge: number;
  payment_method: string | null;
}

// One row per order: customer paid vs boutique goods + shipping + COD fee,
// and each part's goods vs its fees (the courier & logistics charge among
// them), taxes and payout. "Difference" columns are 0 when everything adds
// up; an order with a cancelled part says so instead.
export function reconciliationRows(
  lines: StatementLine[],
  orderByVendorOrder: Map<string, ReconOrder>,
  courierInvoiceByVendorOrder: Map<string, CourierInvoice>,
) {
  const byOrder = groupBy(lines, (l) => orderByVendorOrder.get(l.vendor_order_id)?.id ?? l.order_number);
  return byOrder.map(([, parts]) => {
    const o = orderByVendorOrder.get(parts[0].vendor_order_id);
    const cancelled = parts.some((l) => l.status === "cancelled");
    const goods = sum(parts, (l) => n(l.goods_value));
    const allboutiqs = r2(n(o?.shipping_cost) + n(o?.cod_charge));
    // Goods are after returned pieces; what went back to the customer.
    const refunded = sum(parts, (l) => n(l.refunded));
    const boutiqueCheck = sum(
      parts,
      (l) =>
        n(l.goods_value) +
        n(l.shipping_credit) -
        n(l.commission) -
        n(l.tech_fee) -
        n(l.fee_gst) -
        n(l.gateway_fee) -
        n(l.courier) -
        n(l.cod_charge) -
        (n(l.tcs_igst) + n(l.tcs_cgst) + n(l.tcs_sgst)) -
        n(l.tds) -
        n(l.net_payout),
    );
    const courierInvoiced = sum(parts, (l) => n(courierInvoiceByVendorOrder.get(l.vendor_order_id)?.total));
    return {
      "Order no.": parts[0].order_number,
      "Order date": parts[0].order_date,
      Payment: o?.payment_method === "cod" ? "COD" : "Prepaid",
      Boutiques: parts.map((l) => l.boutique_code).join(", "),
      "Customer paid": n(o?.total),
      "Boutique goods (incl. GST)": goods,
      "Shipping + COD fee": allboutiqs,
      "Difference (paid - refunded - goods - shipping - COD)": cancelled
        ? "has cancellations"
        : r2(n(o?.total) - refunded - goods - allboutiqs),
      "AllBoutiqs invoices issued": courierInvoiced,
      "Courier & logistics charged to boutique": sum(parts, (l) => n(l.courier)),
      Refunded: refunded,
      "Boutique check (goods - fees - taxes - payout)": r2(boutiqueCheck),
    };
  });
}
