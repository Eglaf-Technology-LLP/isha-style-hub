import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";
import { COMPANY } from "@/lib/company";
import type { StatementLine } from "@/lib/statement";

// The tax reports in Download Statement, built from the same records for the
// boutique and for AllBoutiqs so both sides always show the same numbers:
//   * the boutique's GSTR-1 (sales register, B2CS, B2CL, HSN summary,
//     documents issued, Table 14 - supplies through AllBoutiqs) from its
//     customer tax invoices, by invoice date;
//   * its ITC register from AllBoutiqs' fee invoices (= AllBoutiqs' GSTR-1
//     B2B to boutiques);
//   * GST TCS per boutique GSTIN and month (= AllBoutiqs' GSTR-8) from the
//     statement lines;
//   * payouts (bank credits) from the statement lines;
//   * AllBoutiqs only: its courier invoices to customers and an order-by-order
//     check that what the customer paid = boutique goods + AllBoutiqs'
//     courier/shipping/COD, and that each boutique part's goods = fees +
//     taxes + payout.

type Tables = Database["public"]["Tables"];
export type SalesInvoice = Tables["invoices"]["Row"] & { invoice_lines: Tables["invoice_lines"]["Row"][] };
export type FeeInvoice = Tables["fee_invoices"]["Row"];
export type CourierInvoice = Tables["platform_invoices"]["Row"];

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

export function b2csRows(invoices: SalesInvoice[], withBoutique: boolean) {
  const lines = invoices
    .filter((i) => !isB2cl(i))
    .flatMap((i) => i.invoice_lines.map((l) => ({ i, l })));
  return groupBy(lines, ({ i, l }) =>
    [withBoutique ? boutiqueOf(i) : "", pos(i.place_of_supply_code, i.billing_state), n(l.gst_rate)].join("|"),
  ).map(([, g]) => ({
    ...(withBoutique ? { Boutique: boutiqueOf(g[0].i) } : {}),
    Type: "E",
    "Place of supply": pos(g[0].i.place_of_supply_code, g[0].i.billing_state),
    "Rate %": n(g[0].l.gst_rate),
    "Taxable value": sum(g, ({ l }) => n(l.taxable_value)),
    IGST: sum(g, ({ l }) => n(l.igst_amount)),
    CGST: sum(g, ({ l }) => n(l.cgst_amount)),
    SGST: sum(g, ({ l }) => n(l.sgst_amount)),
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

export function hsnRows(invoices: SalesInvoice[], withBoutique: boolean) {
  const lines = invoices.flatMap((i) => i.invoice_lines.map((l) => ({ i, l })));
  return groupBy(lines, ({ i, l }) => [withBoutique ? boutiqueOf(i) : "", l.hsn_code ?? "", n(l.gst_rate)].join("|")).map(
    ([, g]) => ({
      ...(withBoutique ? { Boutique: boutiqueOf(g[0].i) } : {}),
      HSN: g[0].l.hsn_code ?? "",
      UQC: "PCS-PIECES",
      "Total quantity": g.reduce((s, { l }) => s + l.quantity, 0),
      "Rate %": n(g[0].l.gst_rate),
      "Total value": sum(g, ({ l }) => n(l.total)),
      "Taxable value": sum(g, ({ l }) => n(l.taxable_value)),
      IGST: sum(g, ({ l }) => n(l.igst_amount)),
      CGST: sum(g, ({ l }) => n(l.cgst_amount)),
      SGST: sum(g, ({ l }) => n(l.sgst_amount)),
    }),
  );
}

// Table 13: the invoice number range used in the period.
export function documentsIssuedRows(invoices: SalesInvoice[], withBoutique: boolean) {
  return groupBy(invoices, (i) => (withBoutique ? boutiqueOf(i) : "")).map(([, g]) => {
    const numbers = g.map((i) => i.invoice_number).sort();
    return {
      ...(withBoutique ? { Boutique: boutiqueOf(g[0]) } : {}),
      "Nature of document": "Invoices for outward supply",
      "Sr. no. from": numbers[0],
      "Sr. no. to": numbers[numbers.length - 1],
      "Total number": numbers.length,
      Cancelled: 0,
    };
  });
}

// Table 14: supplies made through an e-commerce operator that collects TCS.
export function ecoRows(invoices: SalesInvoice[], withBoutique: boolean) {
  return groupBy(invoices, (i) => (withBoutique ? boutiqueOf(i) : "")).map(([, g]) => ({
    ...(withBoutique ? { Boutique: boutiqueOf(g[0]) } : {}),
    "E-commerce operator": COMPANY.legalName,
    "E-commerce GSTIN": COMPANY.gstin,
    "Net value of supplies": sum(g, (i) => n(i.taxable_value)),
    IGST: sum(g, (i) => n(i.igst_amount)),
    CGST: sum(g, (i) => n(i.cgst_amount)),
    SGST: sum(g, (i) => n(i.sgst_amount)),
  }));
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
    "Taxable value": n(f.taxable_value),
    "GST rate %": n(f.gst_rate),
    CGST: n(f.cgst_amount),
    SGST: n(f.sgst_amount),
    IGST: n(f.igst_amount),
    "Invoice value": n(f.total),
  }));
}

// ---------- GST TCS (section 52) = AllBoutiqs' GSTR-8 ----------

export function tcsRows(lines: StatementLine[], gstinByVendor: Map<string, string>, withBoutique: boolean) {
  return groupBy(lines, (l) => `${withBoutique ? l.boutique_name : ""}|${l.order_date.slice(0, 7)}`).map(([, g]) => {
    const gross = sum(g, (l) => n(l.product_value));
    const net = sum(g, (l) => n(l.net_taxable));
    return {
      ...(withBoutique ? { Boutique: `${g[0].boutique_name} (${g[0].boutique_code})` } : {}),
      Month: format(new Date(`${g[0].order_date.slice(0, 7)}-01`), "MMM yyyy"),
      "Supplier GSTIN": gstinByVendor.get(g[0].vendor_id) ?? "",
      "Gross value of supplies": gross,
      "Value of returns": r2(gross - net),
      "Net value (TCS base)": net,
      "TCS - IGST": sum(g, (l) => n(l.tcs_igst)),
      "TCS - CGST": sum(g, (l) => n(l.tcs_cgst)),
      "TCS - SGST": sum(g, (l) => n(l.tcs_sgst)),
      "TCS total": sum(g, (l) => n(l.tcs_igst) + n(l.tcs_cgst) + n(l.tcs_sgst)),
      "Collected by": `${COMPANY.legalName} (${COMPANY.gstin})`,
    };
  });
}

// ---------- payouts: what reached the bank ----------

export function payoutRows(lines: StatementLine[], withBoutique: boolean) {
  const paid = lines.filter((l) => l.payout_status === "paid");
  return groupBy(paid, (l) => `${withBoutique ? l.boutique_name : ""}|${l.payment_date ?? ""}|${l.utr ?? ""}`).map(
    ([, g]) => ({
      ...(withBoutique ? { Boutique: `${g[0].boutique_name} (${g[0].boutique_code})` } : {}),
      "Payment date": g[0].payment_date ?? "",
      "UTR / reference": g[0].utr ?? "",
      Orders: g.length,
      "Goods (after coupon)": sum(g, (l) => n(l.goods_value)),
      "AllBoutiqs fees incl. GST": sum(g, (l) => n(l.commission) + n(l.tech_fee) + n(l.fee_gst)),
      "Gateway, courier & COD": sum(g, (l) => n(l.gateway_fee) + n(l.courier) + n(l.cod_charge)),
      "GST TCS": sum(g, (l) => n(l.tcs_igst) + n(l.tcs_cgst) + n(l.tcs_sgst)),
      "Income-tax TDS": sum(g, (l) => n(l.tds)),
      "Amount paid": sum(g, (l) => n(l.net_payout)),
      "Fee invoices": [...new Set(g.map((l) => l.fee_invoice_number).filter(Boolean))].join(", "),
    }),
  );
}

// ---------- AllBoutiqs only ----------

// AllBoutiqs' courier invoices to customers (its own GSTR-1, B2C).
export function courierInvoiceRows(invoices: CourierInvoice[]) {
  return invoices.map((i) => ({
    "Invoice no.": i.invoice_number,
    "Invoice date": day(i.issued_at),
    "Place of supply": pos(i.place_of_supply_code, i.billing_state),
    SAC: i.sac_code,
    Pieces: i.pieces,
    Courier: n(i.courier_amount),
    Shipping: n(i.shipping_amount),
    "COD charge": n(i.cod_amount),
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

// One row per order: customer paid vs boutique goods + AllBoutiqs' part, and
// each part's goods vs its fees, taxes and payout. "Difference" columns are 0
// when everything adds up; a cancelled part shows its refund instead.
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
    const courier = sum(parts, (l) => n(l.delivery_charge));
    const allboutiqs = r2(courier + n(o?.shipping_cost) + n(o?.cod_charge));
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
      "AllBoutiqs courier": courier,
      "Shipping + COD charge": r2(n(o?.shipping_cost) + n(o?.cod_charge)),
      "Difference (paid - goods - AllBoutiqs)": cancelled ? "has cancellations" : r2(n(o?.total) - goods - allboutiqs),
      "AllBoutiqs invoices issued": courierInvoiced,
      "Refunded - goods": sum(parts, (l) => n(l.refunded)),
      "Refunded - courier": sum(parts, (l) => n(l.delivery_refunded)),
      "Boutique check (goods - fees - taxes - payout)": r2(boutiqueCheck),
    };
  });
}
