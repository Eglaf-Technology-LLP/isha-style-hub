import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ensureInvoice, InvoiceError } from "./invoice.ts";
import { links, notifyAllAdmins, notifyVendorMembers } from "./notify.ts";
import { emailTemplate, sendEmail } from "./email.ts";
import { money } from "./money.ts";
import { formatDateTime } from "./dates.ts";
import { errorMessage } from "./auth.ts";
import { getWarehouse } from "./warehouse.ts";

// E-way bills for goods worth more than the limit (₹50,000 by default) - see
// the eway_bills migrations. AllBoutiqs is enrolled as a transporter on the
// portal and makes every boutique's e-way bills itself:
//
//   order placed      raiseOrderEwayBills: one request per boutique part
//                     over the limit (tax invoice issued now), one email to
//                     the admins, a "being made" note to each boutique
//   any booking       requestEwayBill: the courier can't be booked until the
//                     number is in (asks for one if nothing asked yet)
//   admin             downloads the requests as the portal's bulk JSON,
//                     uploads it, enters the numbers and PDFs (eway-bill-
//                     actions); announceReady tells the boutique / warehouse
//   watcher           watchEwayBills: missing requests, reminders, portal
//                     cancellations, expiring bills

export type EwayBillLeg =
  | "boutique_to_customer"
  | "boutique_to_warehouse"
  | "warehouse_to_customer"
  | "warehouse_to_boutique"
  | "customer_to_warehouse"
  | "customer_to_boutique";

export const LEG_LABELS: Record<EwayBillLeg, string> = {
  boutique_to_customer: "Boutique to customer",
  boutique_to_warehouse: "Boutique to AllBoutiqs warehouse",
  warehouse_to_customer: "AllBoutiqs warehouse to customer",
  warehouse_to_boutique: "AllBoutiqs warehouse back to boutique",
  customer_to_warehouse: "Customer return to AllBoutiqs warehouse",
  customer_to_boutique: "Customer return to boutique",
};

export const LEGS = Object.keys(LEG_LABELS) as EwayBillLeg[];

// The boutique ships these itself, so it waits for (and prints) the e-way bill.
const BOUTIQUE_LEGS: EwayBillLeg[] = ["boutique_to_customer", "boutique_to_warehouse"];
const WAREHOUSE_LEGS: EwayBillLeg[] = ["warehouse_to_customer", "warehouse_to_boutique"];
const INWARD_LEGS: EwayBillLeg[] = ["customer_to_warehouse", "customer_to_boutique", "warehouse_to_boutique"];

// What the boutique is told to expect.
export const TURNAROUND = "1-2 hours";

const ADMIN_EWAY_URL = "https://allboutiqs.com/admin?tab=eway-bills";

export interface Party {
  name: string;
  address: Record<string, unknown>;
}

export interface EwayBillItem {
  description: string;
  hsn_code: string | null;
  quantity: number;
  taxable_value: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total: number;
}

export interface EwayBill {
  id: string;
  order_id: string;
  vendor_order_id: string;
  vendor_id: string;
  leg: EwayBillLeg;
  document_type: "tax_invoice" | "delivery_challan";
  invoice_id: string | null;
  challan_id: string | null;
  document_number: string;
  document_date: string;
  value: number;
  from_name: string;
  from_address: Record<string, string>;
  to_name: string;
  to_address: Record<string, string>;
  courier_id: number | null;
  courier_name: string | null;
  status: "pending" | "active" | "cancelled";
  ewb_number: string | null;
  ewb_date: string | null;
  valid_until: string | null;
  shipment_id: string | null;
  dispatch_id: string | null;
  return_request_id: string | null;
  send_back_id: string | null;
  supply_type: "O" | "I";
  sub_supply_type: number;
  sub_supply_desc: string | null;
  items: EwayBillItem[] | null;
  pdf_path: string | null;
  created_at: string;
}

export interface EwayBillSettings {
  threshold: number;
  transporterId: string | null;
  transporterName: string;
}

export async function loadEwayBillSettings(supabase: SupabaseClient): Promise<EwayBillSettings> {
  const { data } = await supabase
    .from("platform_settings")
    .select("eway_bill_threshold, eway_bill_transporter_id, eway_bill_transporter_name")
    .maybeSingle();
  return {
    threshold: Number(data?.eway_bill_threshold ?? 50000),
    transporterId: data?.eway_bill_transporter_id ?? null,
    transporterName: data?.eway_bill_transporter_name || "AllBoutiqs",
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// The date in India, for a document date.
const istDate = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

export const orderRef = (orderId: string) => `#${orderId.slice(0, 8).toUpperCase()}`;

// ---------- a movement of goods ----------

export interface Movement {
  vendorOrderId: string;
  leg: EwayBillLeg;
  from: Party;
  to: Party;
  // What it belongs to besides the order part itself.
  returnRequestId?: string | null;
  sendBackId?: string | null;
  dispatchId?: string | null;
  // Only these goods move (returns, replacements, send-backs); null = the
  // whole part as invoiced.
  items?: { order_item_id: string; quantity: number }[] | null;
  // How it is filed when the leg's default doesn't fit.
  subSupply?: { type: number; desc: string | null } | null;
  requestedBy: string | null;
}

type MovementKey = Pick<Movement, "vendorOrderId" | "leg" | "returnRequestId" | "sendBackId" | "items">;

// The first leg of an order travels on the boutique's tax invoice; every
// other movement on a delivery challan of its own.
const onTaxInvoice = (m: MovementKey) =>
  !m.returnRequestId && !m.sendBackId && BOUTIQUE_LEGS.includes(m.leg);

// Portal codes: supply O outward / I inward; sub-type 1 Supply, 7 Sales
// Return, 8 Others (with a description). Agreed defaults - see the migration.
function supplyFor(m: Movement): { supply_type: "O" | "I"; sub_supply_type: number; sub_supply_desc: string | null } {
  const supply_type = INWARD_LEGS.includes(m.leg) ? "I" : "O";
  if (m.subSupply) return { supply_type, sub_supply_type: m.subSupply.type, sub_supply_desc: m.subSupply.desc };
  if (supply_type === "I") return { supply_type, sub_supply_type: 7, sub_supply_desc: null };
  if (onTaxInvoice(m)) return { supply_type, sub_supply_type: 1, sub_supply_desc: null };
  return {
    supply_type,
    sub_supply_type: 8,
    sub_supply_desc: m.returnRequestId ? "Exchange or return" : "Fulfilment delivery",
  };
}

// A request not yet used by a live booking (a cancelled booking frees it).
async function findOpenEwayBill(supabase: SupabaseClient, m: MovementKey): Promise<EwayBill | null> {
  let q = supabase
    .from("eway_bills")
    .select("*")
    .eq("vendor_order_id", m.vendorOrderId)
    .eq("leg", m.leg)
    .or("status.eq.pending,and(status.eq.active,shipment_id.is.null)");
  q = m.returnRequestId ? q.eq("return_request_id", m.returnRequestId) : q.is("return_request_id", null);
  q = m.sendBackId ? q.eq("send_back_id", m.sendBackId) : q.is("send_back_id", null);
  const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as EwayBill) ?? null;
}

// Before any document is issued: what the goods come to, roughly. The whole
// part: what its invoice comes to (or will). Some items: their prices with
// GST, before any coupon - only used to decide whether to work it out
// properly from the invoice.
async function estimateValue(supabase: SupabaseClient, m: MovementKey): Promise<number | null> {
  if (!m.items?.length) {
    const { data, error } = await supabase.rpc("vendor_order_invoice_value", { _vendor_order_id: m.vendorOrderId });
    if (error) throw error;
    return data == null ? null : Number(data);
  }
  const { data: lines } = await supabase
    .from("order_items")
    .select("id, price")
    .in("id", m.items.map((i) => i.order_item_id));
  const priceById = new Map((lines ?? []).map((l) => [l.id, Number(l.price ?? 0)]));
  return round2(m.items.reduce((s, i) => s + (priceById.get(i.order_item_id) ?? 0) * Number(i.quantity ?? 1), 0));
}

// The goods on the e-way bill, from the invoice: all of it, or only the
// moved lines (their share by quantity, no delivery charge).
function goodsFrom(invoice: any, lines: any[], items?: Movement["items"]) {
  const toItem = (l: any, ratio: number): EwayBillItem => ({
    description: String(l.description),
    hsn_code: l.hsn_code ?? null,
    quantity: round2(Number(l.quantity) * ratio),
    taxable_value: round2(Number(l.taxable_value) * ratio),
    gst_rate: Number(l.gst_rate),
    cgst_amount: round2(Number(l.cgst_amount) * ratio),
    sgst_amount: round2(Number(l.sgst_amount) * ratio),
    igst_amount: round2(Number(l.igst_amount) * ratio),
    total: round2(Number(l.total) * ratio),
  });
  const list: EwayBillItem[] = items?.length
    ? items.flatMap((i) => {
        const line = lines.find((l) => l.order_item_id === i.order_item_id);
        if (!line || !Number(line.quantity)) return [];
        return [toItem(line, Math.min(1, Number(i.quantity ?? 1) / Number(line.quantity)))];
      })
    : lines.map((l) => toItem(l, 1));
  const sum = (k: keyof EwayBillItem) => round2(list.reduce((s, i) => s + Number(i[k]), 0));
  return {
    items: list,
    taxable_value: sum("taxable_value"),
    cgst_amount: sum("cgst_amount"),
    sgst_amount: sum("sgst_amount"),
    igst_amount: sum("igst_amount"),
    // The whole part: exactly the invoice total (its lines already add up to it).
    total: items?.length ? sum("total") : Number(invoice.total),
  };
}

// What the booking screens show before booking - null when no e-way bill is
// needed. bill is null while nothing has been asked for yet.
export async function ewayBillPreview(supabase: SupabaseClient, m: MovementKey) {
  const settings = await loadEwayBillSettings(supabase);
  const value = await estimateValue(supabase, m);
  if (value == null || value <= settings.threshold) return null;
  const { data: vo } = await supabase.from("vendor_orders").select("order_id").eq("id", m.vendorOrderId).single();
  const open = await findOpenEwayBill(supabase, m);
  return {
    vendor_order_id: m.vendorOrderId,
    order_id: vo!.order_id as string,
    value: open ? Number(open.value) : value,
    threshold: settings.threshold,
    turnaround: TURNAROUND,
    bill: open ? ewayBillSummary(open) : null,
  };
}

export type EwayBillCheck =
  | { required: false }
  | { required: true; ready: boolean; bill: EwayBill; created: boolean };

// The e-way bill this movement needs, asked for now if it hasn't been.
// announce: false when the caller tells everyone about a batch itself.
// Throws InvoiceError when the document can't be issued (no GSTIN, no HSN...).
export async function requestEwayBill(
  supabase: SupabaseClient,
  m: Movement,
  opts: { announce?: boolean } = {},
): Promise<EwayBillCheck> {
  const settings = await loadEwayBillSettings(supabase);
  const estimate = await estimateValue(supabase, m);
  if (estimate == null || estimate <= settings.threshold) return { required: false };

  const open = await findOpenEwayBill(supabase, m);
  if (open) {
    if (m.dispatchId && !open.dispatch_id) {
      await supabase.from("eway_bills").update({ dispatch_id: m.dispatchId }).eq("id", open.id);
      open.dispatch_id = m.dispatchId;
    }
    return { required: true, ready: open.status === "active", bill: open, created: false };
  }

  const { data: vo, error: voErr } = await supabase
    .from("vendor_orders")
    .select("id, order_id, vendor_id")
    .eq("id", m.vendorOrderId)
    .single();
  if (voErr) throw voErr;

  const { invoice, lines } = await ensureInvoice(supabase, m.vendorOrderId);
  const goods = goodsFrom(invoice, lines, m.items);
  if (goods.total <= settings.threshold) return { required: false };

  let documentType: EwayBill["document_type"] = "tax_invoice";
  let documentNumber: string = invoice.invoice_number;
  let documentDate = istDate(invoice.issued_at);
  let challanId: string | null = null;
  if (!onTaxInvoice(m)) {
    const issuedAt = new Date().toISOString();
    const { data: challanNumber, error: numErr } = await supabase.rpc("next_boutique_challan_number", {
      _vendor_id: vo.vendor_id,
      _at: issuedAt,
    });
    if (numErr) throw numErr;
    const { data: challan, error: challanErr } = await supabase
      .from("delivery_challans")
      .insert({
        challan_number: challanNumber,
        vendor_order_id: vo.id,
        order_id: vo.order_id,
        vendor_id: vo.vendor_id,
        invoice_id: invoice.id,
        dispatch_id: m.dispatchId ?? null,
        return_request_id: m.returnRequestId ?? null,
        send_back_id: m.sendBackId ?? null,
        issued_at: issuedAt,
        dispatch_from_name: m.from.name,
        dispatch_from_address: m.from.address,
        ship_to_name: m.to.name,
        ship_to_address: m.to.address,
        value: goods.total,
        reason: INWARD_LEGS.includes(m.leg)
          ? "Return of goods invoiced to the customer"
          : m.returnRequestId
            ? "Exchange or return goods"
            : "Delivery of goods already invoiced to the customer",
      })
      .select("id")
      .single();
    if (challanErr) throw challanErr;
    documentType = "delivery_challan";
    documentNumber = challanNumber as string;
    documentDate = istDate(issuedAt);
    challanId = challan.id;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("eway_bills")
    .insert({
      order_id: vo.order_id,
      vendor_order_id: vo.id,
      vendor_id: vo.vendor_id,
      leg: m.leg,
      document_type: documentType,
      invoice_id: invoice.id,
      challan_id: challanId,
      document_number: documentNumber,
      document_date: documentDate,
      value: goods.total,
      from_name: m.from.name,
      from_address: m.from.address,
      to_name: m.to.name,
      to_address: m.to.address,
      dispatch_id: m.dispatchId ?? null,
      return_request_id: m.returnRequestId ?? null,
      send_back_id: m.sendBackId ?? null,
      ...supplyFor(m),
      items: goods.items,
      taxable_value: goods.taxable_value,
      cgst_amount: goods.cgst_amount,
      sgst_amount: goods.sgst_amount,
      igst_amount: goods.igst_amount,
      requested_by: m.requestedBy,
    })
    .select("*")
    .single();
  if (insertErr) {
    // Asked for at the same moment elsewhere (two clicks, the watcher) - use that one.
    if ((insertErr as { code?: string }).code === "23505") {
      if (challanId) await supabase.from("delivery_challans").delete().eq("id", challanId);
      const raced = await findOpenEwayBill(supabase, m);
      if (raced) return { required: true, ready: raced.status === "active", bill: raced, created: false };
    }
    throw insertErr;
  }

  const bill = inserted as EwayBill;
  if (opts.announce !== false) await announceRequests(supabase, [bill]);
  return { required: true, ready: false, bill, created: true };
}

// The booking functions' name for it.
export const ewayBillForBooking = requestEwayBill;

// The booking that used it - a later booking of this movement needs a new one.
export async function markEwayBillsUsed(supabase: SupabaseClient, billIds: string[], shipmentId: string) {
  if (!billIds.length) return;
  const { error } = await supabase.from("eway_bills").update({ shipment_id: shipmentId }).in("id", billIds);
  if (error) console.error("markEwayBillsUsed failed", error);
}

// What the booking screens show about a request.
export function ewayBillSummary(bill: EwayBill) {
  return {
    id: bill.id,
    vendor_order_id: bill.vendor_order_id,
    leg: bill.leg,
    status: bill.status,
    value: bill.value,
    document_type: bill.document_type,
    document_number: bill.document_number,
    document_date: bill.document_date,
    from_name: bill.from_name,
    from_address: bill.from_address,
    to_name: bill.to_name,
    to_address: bill.to_address,
    ewb_number: bill.ewb_number,
    valid_until: bill.valid_until,
    pdf_path: bill.pdf_path,
    requested_at: bill.created_at,
  };
}

// ---------- the usual parties for an order part ----------

// Dispatch from / ship to for a leg of an order part: the boutique, the
// order's warehouse, the customer.
export async function movementFor(
  supabase: SupabaseClient,
  vendorOrderId: string,
  leg: EwayBillLeg,
  extra: Partial<Movement> = {},
): Promise<Movement> {
  const { data: vo, error } = await supabase
    .from("vendor_orders")
    .select("id, order_id, vendor_id, vendors(name, address), orders(customer_name, shipping_address, warehouse_id)")
    .eq("id", vendorOrderId)
    .single();
  if (error) throw error;
  const v = (vo as any).vendors;
  const o = (vo as any).orders;
  const boutique: Party = { name: v?.name ?? "Boutique", address: (v?.address ?? {}) as Record<string, unknown> };
  const customer: Party = { name: o?.customer_name ?? "Customer", address: (o?.shipping_address ?? {}) as Record<string, unknown> };
  const needsWarehouse = leg.includes("warehouse");
  if (needsWarehouse && !o?.warehouse_id) throw new InvoiceError("This order doesn't go through the warehouse", 400);
  const wh = needsWarehouse ? await getWarehouse(supabase, o.warehouse_id) : null;
  const warehouse: Party | null = wh ? { name: wh.name, address: wh.address as unknown as Record<string, unknown> } : null;
  const parties: Record<EwayBillLeg, [Party, Party]> = {
    boutique_to_customer: [boutique, customer],
    boutique_to_warehouse: [boutique, warehouse!],
    warehouse_to_customer: [warehouse!, customer],
    warehouse_to_boutique: [warehouse!, boutique],
    customer_to_warehouse: [customer, warehouse!],
    customer_to_boutique: [customer, boutique],
  };
  const [from, to] = parties[leg];
  return { vendorOrderId, leg, from, to, requestedBy: null, ...extra };
}

// ---------- order placed ----------

// Every boutique part of a placed order that's over the limit gets its
// request now - one email for the order, so a three-boutique order is one
// message. Problems (no GSTIN, no HSN) are in the same email.
export async function raiseOrderEwayBills(supabase: SupabaseClient, orderId: string): Promise<EwayBill[]> {
  const [{ data: order }, { data: parts }] = await Promise.all([
    supabase.from("orders").select("id, fulfilment_route, warehouse_id").eq("id", orderId).maybeSingle(),
    supabase.from("vendor_orders").select("id, vendors(name)").eq("order_id", orderId).neq("status", "cancelled"),
  ]);
  if (!order || !parts?.length) return [];
  const leg: EwayBillLeg =
    order.fulfilment_route === "warehouse" && order.warehouse_id ? "boutique_to_warehouse" : "boutique_to_customer";
  const created: EwayBill[] = [];
  const problems: string[] = [];
  for (const part of parts) {
    try {
      const check = await requestEwayBill(supabase, await movementFor(supabase, part.id, leg), { announce: false });
      if (check.required && check.created) created.push(check.bill);
    } catch (e) {
      const boutique = (part as any).vendors?.name ?? "A boutique";
      problems.push(`${boutique} - order ${orderRef(orderId)}: ${errorMessage(e)}`);
      console.error("raiseOrderEwayBills failed", part.id, errorMessage(e));
    }
  }
  await announceRequests(supabase, created, problems);
  return created;
}

// A return / exchange pickup from the customer: the courier collects it, so
// nothing waits on it - AllBoutiqs makes the e-way bill (one per boutique
// part over the limit) before the courier comes.
export async function raiseReturnEwayBills(supabase: SupabaseClient, returnRequestId: string): Promise<EwayBill[]> {
  const { data: rr } = await supabase
    .from("return_requests")
    .select("id, order_id, items, return_destination, orders(warehouse_id)")
    .eq("id", returnRequestId)
    .maybeSingle();
  if (!rr) return [];
  // As bookReversePickup: to the warehouse only when the order has one.
  const toWarehouse = rr.return_destination === "warehouse" && !!(rr as any).orders?.warehouse_id;
  const rrItems = (rr.items ?? []) as { order_item_id: string; quantity: number }[];
  const { data: lines } = await supabase
    .from("order_items")
    .select("id, vendor_order_id, vendors(name)")
    .in("id", rrItems.map((i) => i.order_item_id).filter(Boolean));
  type Group = { name: string; items: { order_item_id: string; quantity: number }[] };
  const byPart = new Map<string, Group>();
  for (const i of rrItems) {
    const line = (lines ?? []).find((l) => l.id === i.order_item_id) as { vendor_order_id?: string; vendors?: { name?: string } } | undefined;
    if (!line?.vendor_order_id) continue;
    const group: Group = byPart.get(line.vendor_order_id) ?? { name: line.vendors?.name ?? "A boutique", items: [] };
    group.items.push({ order_item_id: i.order_item_id, quantity: Number(i.quantity ?? 1) });
    byPart.set(line.vendor_order_id, group);
  }
  const leg: EwayBillLeg = toWarehouse ? "customer_to_warehouse" : "customer_to_boutique";
  const created: EwayBill[] = [];
  const problems: string[] = [];
  for (const [vendorOrderId, group] of byPart) {
    try {
      const m = await movementFor(supabase, vendorOrderId, leg, { returnRequestId, items: group.items });
      const check = await requestEwayBill(supabase, m, { announce: false });
      if (check.required && check.created) created.push(check.bill);
    } catch (e) {
      problems.push(`${group.name} - return on order ${orderRef(rr.order_id)}: ${errorMessage(e)}`);
    }
  }
  await announceRequests(supabase, created, problems);
  return created;
}

// ---------- telling people ----------

async function adminEmails(supabase: SupabaseClient): Promise<string[]> {
  const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const emails = await Promise.all(
    (roles ?? []).map(async (r) => {
      const { data } = await supabase.auth.admin.getUserById(r.user_id);
      return data?.user?.email ?? null;
    }),
  );
  return [...new Set(emails.filter((e): e is string => !!e))];
}

async function emailAdmins(supabase: SupabaseClient, subject: string, html: string) {
  for (const email of await adminEmails(supabase)) {
    await sendEmail(email, subject, html).catch((e) => console.error("eway bill: admin email failed", email, errorMessage(e)));
  }
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function vendorNames(supabase: SupabaseClient, vendorIds: string[]): Promise<Map<string, string>> {
  if (!vendorIds.length) return new Map();
  const { data } = await supabase.from("vendors").select("id, name").in("id", [...new Set(vendorIds)]);
  return new Map((data ?? []).map((v) => [v.id, v.name]));
}

// One row per e-way bill, for the admins' emails.
function billTable(bills: EwayBill[], names: Map<string, string>, extra?: (b: EwayBill) => string): string {
  const th = (t: string) => `<th style="text-align:left; padding:6px 8px; font-size:12px; color:#8a8a8a; font-weight:500;">${t}</th>`;
  const td = (t: string) => `<td style="padding:6px 8px; font-size:13px; border-top:1px solid #eee; vertical-align:top;">${t}</td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; background:#f9f6f2; border-radius:8px; margin:16px 0;">
    <tr>${th("Boutique")}${th("Order")}${th("Movement")}${th("Document")}${th("Value")}${extra ? th("") : ""}</tr>
    ${bills
      .map(
        (b) =>
          `<tr>${td(esc(names.get(b.vendor_id) ?? "Boutique"))}${td(esc(orderRef(b.order_id)))}${td(esc(LEG_LABELS[b.leg]))}${td(
            `${esc(b.document_number)}${b.ewb_number ? `<br><span style="color:#8a8a8a;">EWB ${esc(b.ewb_number)}</span>` : ""}`,
          )}${td(esc(money(b.value)))}${extra ? td(extra(b)) : ""}</tr>`,
      )
      .join("")}
  </table>`;
}

// New requests: one email and one notification for the admins, and each
// boutique that ships its own parcel is told it's being made.
export async function announceRequests(supabase: SupabaseClient, bills: EwayBill[], problems: string[] = []) {
  if (!bills.length && !problems.length) return;
  try {
    const settings = await loadEwayBillSettings(supabase);
    const names = await vendorNames(supabase, bills.map((b) => b.vendor_id));
    const orders = [...new Set(bills.map((b) => orderRef(b.order_id)))];

    if (bills.length) {
      await notifyAllAdmins(supabase, {
        type: "eway_bill_needed",
        title: bills.length === 1 ? "E-way bill needed" : `${bills.length} e-way bills needed`,
        body: bills
          .map((b) => `${names.get(b.vendor_id) ?? "Boutique"} - order ${orderRef(b.order_id)}, ${LEG_LABELS[b.leg].toLowerCase()}, ${money(b.value)}`)
          .join("; "),
        link: bills.length === 1 ? links.adminEwayBill(bills[0].id) : "/admin?tab=eway-bills",
        category: "order",
      });
    }
    if (problems.length) {
      await notifyAllAdmins(supabase, {
        type: "eway_bill_problem",
        title: "E-way bill can't be prepared",
        body: problems.join("; "),
        link: "/admin?tab=eway-bills",
        category: "order",
      });
    }

    const subject = bills.length
      ? `${bills.length === 1 ? "E-way bill" : `${bills.length} e-way bills`} needed - order ${orders.join(", ")}`
      : "E-way bill can't be prepared";
    await emailAdmins(
      supabase,
      subject,
      emailTemplate({
        heading: bills.length ? "E-way bills to make" : "E-way bill problem",
        preheader: subject,
        bodyHtml: `${
          bills.length
            ? `<p>These are over ${esc(money(settings.threshold))}, so they can't be booked with the courier until their e-way bill number is entered. The boutiques have been told it's usually ready within ${TURNAROUND}.</p>
          ${billTable(bills, names)}
          <p>Open <strong>E-way bills</strong>, download the JSON, upload it on ewaybillgst.gov.in (e-Waybill &gt; Generate Bulk), then enter the numbers and attach the PDFs.</p>`
            : ""
        }${
          problems.length
            ? `<p style="color:#b42318;"><strong>Couldn't prepare</strong> - fix these and the request is made on the next try:</p><ul>${problems
                .map((p) => `<li>${esc(p)}</li>`)
                .join("")}</ul>`
            : ""
        }`,
        ctaLabel: "Open E-way bills",
        ctaUrl: ADMIN_EWAY_URL,
      }),
    );

    for (const b of bills.filter((b) => BOUTIQUE_LEGS.includes(b.leg) && !b.return_request_id)) {
      await notifyVendorMembers(supabase, b.vendor_id, {
        type: "eway_bill_needed",
        title: "E-way bill being made",
        body: `Order ${orderRef(b.order_id)} is over ${money(settings.threshold)}, so it needs an e-way bill. AllBoutiqs is making it - usually ready within ${TURNAROUND}. Pack the order meanwhile; we'll tell you when you can ship.`,
        link: links.vendorOrder(b.vendor_order_id),
      });
    }
  } catch (e) {
    // Never blocks the request itself - the admin page lists it either way.
    console.error("eway bill: announcing requests failed", errorMessage(e));
  }
}

// The number is in: whoever ships the parcel can book it.
export async function announceReady(supabase: SupabaseClient, bill: EwayBill) {
  const ref = orderRef(bill.order_id);
  try {
    if (WAREHOUSE_LEGS.includes(bill.leg)) {
      await supabase.rpc("notify_warehouse", {
        _type: "eway_bill_ready",
        _title: "E-way bill ready - book the parcel",
        _body: `E-way bill ${bill.ewb_number} for order ${ref} (${LEG_LABELS[bill.leg].toLowerCase()}) is in. Print it with the challan and book the parcel.`,
        _link: bill.leg === "warehouse_to_customer" ? `/warehouse?tab=pack&focus=${bill.order_id}` : "/warehouse",
      });
      return;
    }
    if (!BOUTIQUE_LEGS.includes(bill.leg)) return; // customer returns: the courier collects; nothing to tell
    // An exchange replacement is shipped from the Returns tab.
    const tab = bill.return_request_id ? "Returns" : "Orders";
    const link = bill.return_request_id ? links.vendorReturn(bill.return_request_id) : links.vendorOrder(bill.vendor_order_id);
    const copy = bill.pdf_path
      ? `Download and print it from your ${tab} tab`
      : `The printable copy will be in your ${tab} tab shortly`;
    await notifyVendorMembers(supabase, bill.vendor_id, {
      type: "eway_bill_ready",
      title: "E-way bill ready - ship the order",
      body: `E-way bill ${bill.ewb_number} for order ${ref} is ready. ${copy}, put it in the parcel and press Ship Now.`,
      link,
    });
    const { data: vendor } = await supabase.from("vendors").select("contact_email").eq("id", bill.vendor_id).single();
    if (vendor?.contact_email) {
      await sendEmail(
        vendor.contact_email,
        `E-way bill ready - order ${ref}`,
        emailTemplate({
          heading: "E-way bill ready",
          preheader: `Order ${ref} can be shipped now`,
          bodyHtml: `<p>The e-way bill for order <strong>${esc(ref)}</strong> is ready: <strong>${esc(bill.ewb_number)}</strong>${
            bill.valid_until ? `, valid until ${esc(formatDateTime(bill.valid_until))}` : ""
          }.</p>
          <ol style="padding-left:20px;">
            <li>${esc(copy)} (${tab} &gt; the order &gt; <strong>Print / download</strong> next to the e-way bill).</li>
            <li>Put the printed e-way bill and the ${bill.document_type === "delivery_challan" ? "delivery challan" : "invoice"} in the parcel.</li>
            <li>Press <strong>Ship Now</strong> - the e-way bill number goes to the courier with the booking.</li>
          </ol>`,
          ctaLabel: "Open the order",
          ctaUrl: `https://allboutiqs.com${link}`,
        }),
      );
    }
  } catch (e) {
    console.error("eway bill: announcing the number failed", errorMessage(e));
  }
}

// The PDF arrived after the number - the printable copy is there now.
export async function announcePdf(supabase: SupabaseClient, bill: EwayBill) {
  const ref = orderRef(bill.order_id);
  try {
    if (WAREHOUSE_LEGS.includes(bill.leg)) {
      await supabase.rpc("notify_warehouse", {
        _type: "eway_bill_pdf",
        _title: "E-way bill copy ready to print",
        _body: `The e-way bill ${bill.ewb_number} for order ${ref} can be printed now.`,
        _link: bill.leg === "warehouse_to_customer" ? `/warehouse?tab=pack&focus=${bill.order_id}` : "/warehouse",
      });
      return;
    }
    if (!BOUTIQUE_LEGS.includes(bill.leg)) return;
    await notifyVendorMembers(supabase, bill.vendor_id, {
      type: "eway_bill_pdf",
      title: "E-way bill copy ready to print",
      body: `Print the e-way bill ${bill.ewb_number} for order ${ref} from your ${bill.return_request_id ? "Returns" : "Orders"} tab and put it in the parcel.`,
      link: bill.return_request_id ? links.vendorReturn(bill.return_request_id) : links.vendorOrder(bill.vendor_order_id),
    });
  } catch (e) {
    console.error("eway bill: announcing the PDF failed", errorMessage(e));
  }
}

// ---------- the watcher ----------

const HOUR = 3_600_000;

// Run every 15 minutes (cron) and on events (a part passing inspection, a
// part cancelled with an e-way bill made). Each alert goes out once.
export async function watchEwayBills(supabase: SupabaseClient) {
  const result = { raised: 0, reminded: 0, toCancel: 0, expiring: 0, problems: 0 };

  // 1. Requests that should exist but don't (order-time raise failed, part
  //    passed inspection at the warehouse). Problems were already reported
  //    when the order was placed, so they're only logged here.
  const { data: missing, error: missErr } = await supabase.rpc("eway_bill_missing_requests");
  if (missErr) console.error("eway watch: missing requests", missErr);
  const raised: EwayBill[] = [];
  for (const row of (missing ?? []) as { vendor_order_id: string; leg: EwayBillLeg }[]) {
    try {
      const check = await requestEwayBill(supabase, await movementFor(supabase, row.vendor_order_id, row.leg), { announce: false });
      if (check.required && check.created) raised.push(check.bill);
    } catch (e) {
      result.problems++;
      console.error("eway watch: request failed", row.vendor_order_id, row.leg, errorMessage(e));
    }
  }
  await announceRequests(supabase, raised);
  result.raised = raised.length;

  const now = Date.now();

  // 2. Waiting over 2 hours.
  const { data: late } = await supabase
    .from("eway_bills")
    .select("*")
    .eq("status", "pending")
    .is("reminded_at", null)
    .lt("created_at", new Date(now - 2 * HOUR).toISOString());
  if (late?.length) {
    const bills = late as EwayBill[];
    const names = await vendorNames(supabase, bills.map((b) => b.vendor_id));
    await notifyAllAdmins(supabase, {
      type: "eway_bill_reminder",
      title: `${bills.length} e-way bill${bills.length === 1 ? "" : "s"} waiting over 2 hours`,
      body: "Boutiques were told about 1-2 hours. Make them on the portal and enter the numbers.",
      link: "/admin?tab=eway-bills",
      category: "order",
    });
    await emailAdmins(
      supabase,
      `Reminder: ${bills.length} e-way bill${bills.length === 1 ? "" : "s"} waiting over 2 hours`,
      emailTemplate({
        heading: "E-way bills still waiting",
        preheader: "Boutiques were told 1-2 hours",
        bodyHtml: `<p>These were asked for over 2 hours ago and the parcels can't be booked until their numbers are in:</p>${billTable(
          bills,
          names,
          (b) => `asked ${esc(formatDateTime(b.created_at))}`,
        )}`,
        ctaLabel: "Open E-way bills",
        ctaUrl: ADMIN_EWAY_URL,
      }),
    );
    await supabase.from("eway_bills").update({ reminded_at: new Date().toISOString() }).in("id", bills.map((b) => b.id));
    result.reminded = bills.length;
  }

  // 3. Made, but the part was cancelled before it shipped - cancel on the
  //    portal (allowed within 24 hours of making it).
  const { data: made } = await supabase
    .from("eway_bills")
    .select("*, vendor_orders(status)")
    .eq("status", "active")
    .is("cancel_alerted_at", null)
    .is("return_request_id", null)
    .is("send_back_id", null);
  const cancelledParts = ((made ?? []) as (EwayBill & { vendor_orders: { status: string } | null })[]).filter(
    (b) => b.vendor_orders?.status === "cancelled",
  );
  const shipmentIds = cancelledParts.map((b) => b.shipment_id).filter((id): id is string => !!id);
  const { data: shipments } = shipmentIds.length
    ? await supabase.from("shipments").select("id, status").in("id", shipmentIds)
    : { data: [] as { id: string; status: string }[] };
  const liveShipment = new Set((shipments ?? []).filter((s) => s.status !== "cancelled").map((s) => s.id));
  const toCancel = cancelledParts.filter((b) => !b.shipment_id || !liveShipment.has(b.shipment_id));
  if (toCancel.length) {
    const names = await vendorNames(supabase, toCancel.map((b) => b.vendor_id));
    await notifyAllAdmins(supabase, {
      type: "eway_bill_cancel",
      title: `Cancel ${toCancel.length} e-way bill${toCancel.length === 1 ? "" : "s"} on the portal`,
      body: toCancel.map((b) => `${b.ewb_number} (order ${orderRef(b.order_id)})`).join(", ") + " - the order was cancelled. The portal allows it within 24 hours of making it.",
      link: links.adminEwayBill(toCancel[0].id),
      category: "order",
    });
    await emailAdmins(
      supabase,
      `Cancel e-way bill${toCancel.length === 1 ? "" : "s"} on the portal - order cancelled`,
      emailTemplate({
        heading: "Cancel these e-way bills",
        preheader: "The order was cancelled after the e-way bill was made",
        bodyHtml: `<p>The order part was cancelled after its e-way bill was made. Cancel each on ewaybillgst.gov.in (e-Waybill &gt; Cancel) - allowed within <strong>24 hours of making it</strong> - then press <strong>Mark cancelled</strong> on the E-way bills page.</p>${billTable(
          toCancel,
          names,
          (b) => (b.ewb_date ? `made ${esc(formatDateTime(b.ewb_date))}` : ""),
        )}`,
        ctaLabel: "Open E-way bills",
        ctaUrl: ADMIN_EWAY_URL,
      }),
    );
    await supabase.from("eway_bills").update({ cancel_alerted_at: new Date().toISOString() }).in("id", toCancel.map((b) => b.id));
    result.toCancel = toCancel.length;
  }

  // 4. Running out within 8 hours (the portal allows extending from 8 hours
  //    before to 8 hours after) while the parcel is still on its way.
  const { data: ending } = await supabase
    .from("eway_bills")
    .select("*")
    .eq("status", "active")
    .not("valid_until", "is", null)
    .lt("valid_until", new Date(now + 8 * HOUR).toISOString())
    .gt("valid_until", new Date(now - 8 * HOUR).toISOString());
  const candidates = ((ending ?? []) as (EwayBill & { expiry_alerted_at: string | null; last_extended_at: string | null })[]).filter(
    (b) => !b.expiry_alerted_at || (b.last_extended_at && b.expiry_alerted_at < b.last_extended_at),
  );
  if (candidates.length) {
    const ids = candidates.map((b) => b.shipment_id).filter((id): id is string => !!id);
    const { data: ship } = ids.length
      ? await supabase.from("shipments").select("id, status").in("id", ids)
      : { data: [] as { id: string; status: string }[] };
    const statusById = new Map((ship ?? []).map((s) => [s.id, s.status]));
    // Not booked yet, or booked and not delivered / cancelled.
    const onTheWay = candidates.filter((b) => {
      const s = b.shipment_id ? statusById.get(b.shipment_id) : null;
      return !s || !["delivered", "cancelled", "lost"].includes(s);
    });
    if (onTheWay.length) {
      const names = await vendorNames(supabase, onTheWay.map((b) => b.vendor_id));
      await notifyAllAdmins(supabase, {
        type: "eway_bill_expiring",
        title: `${onTheWay.length} e-way bill${onTheWay.length === 1 ? "" : "s"} running out`,
        body: onTheWay.map((b) => `${b.ewb_number} (order ${orderRef(b.order_id)}) until ${formatDateTime(b.valid_until)}`).join(", "),
        link: links.adminEwayBill(onTheWay[0].id),
        category: "order",
      });
      await emailAdmins(
        supabase,
        `Extend e-way bill${onTheWay.length === 1 ? "" : "s"} - running out`,
        emailTemplate({
          heading: "E-way bills running out",
          preheader: "Extend them on the portal",
          bodyHtml: `<p>These parcels are still on their way. Extend each on ewaybillgst.gov.in (e-Waybill &gt; Extend Validity - from 8 hours before to 8 hours after it ends), then press <strong>Extend</strong> on the E-way bills page with the new date.</p>${billTable(
            onTheWay,
            names,
            (b) => `until ${esc(formatDateTime(b.valid_until))}`,
          )}`,
          ctaLabel: "Open E-way bills",
          ctaUrl: ADMIN_EWAY_URL,
        }),
      );
      await supabase.from("eway_bills").update({ expiry_alerted_at: new Date().toISOString() }).in("id", onTheWay.map((b) => b.id));
      result.expiring = onTheWay.length;
    }
  }

  return result;
}
