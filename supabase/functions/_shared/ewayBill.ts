import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ensureInvoice, InvoiceError } from "./invoice.ts";
import { links, notifyAllAdmins, notifyVendorMembers } from "./notify.ts";
import { emailTemplate, sendEmail } from "./email.ts";
import { money } from "./money.ts";
import { formatDate, formatDateTime } from "./dates.ts";
import { errorMessage } from "./auth.ts";
import { shiprocketRequest } from "./shiprocket.ts";

// E-way bills for parcels over the limit (see the eway_bills migrations).
// Before a courier booking of a boutique part, the booking function asks
// ewayBillForBooking: below the limit nothing changes; above it the first
// attempt issues the movement's document (tax invoice, return invoice or
// delivery challan), records an e-way bill request for the courier and tells
// AllBoutiqs (or the boutique, if it makes its own); the booking goes ahead
// only once an admin has typed the number in, with the courier the e-way
// bill is made out to.
//
// A customer's return pickup is booked first (that's when Shiprocket names
// the courier) and its pickup held until the number is in. An RTO parcel is
// already moving: its e-way bill is asked for so it can be uploaded to
// Shiprocket's RTO order.

export type EwayBillLeg =
  | "boutique_to_customer"
  | "boutique_to_warehouse"
  | "warehouse_to_customer"
  | "customer_to_warehouse"
  | "customer_to_boutique"
  | "warehouse_to_boutique";

export const LEG_LABELS: Record<EwayBillLeg, string> = {
  boutique_to_customer: "Boutique to customer",
  boutique_to_warehouse: "Boutique to AllBoutiqs warehouse",
  warehouse_to_customer: "AllBoutiqs warehouse to customer",
  customer_to_warehouse: "Customer to AllBoutiqs warehouse",
  customer_to_boutique: "Customer to boutique",
  warehouse_to_boutique: "AllBoutiqs warehouse to boutique",
};

const DOCUMENT_LABELS: Record<string, string> = {
  tax_invoice: "Tax Invoice",
  delivery_challan: "Delivery Challan",
  return_invoice: "Return Invoice",
};

export interface Party {
  name: string;
  address: Record<string, unknown>;
}

export interface EwayBill {
  id: string;
  order_id: string;
  vendor_order_id: string;
  vendor_id: string;
  leg: EwayBillLeg;
  movement: string;
  document_type: "tax_invoice" | "delivery_challan" | "return_invoice";
  invoice_id: string | null;
  return_invoice_id: string | null;
  challan_id: string | null;
  return_request_id: string | null;
  send_back_id: string | null;
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
  created_at: string;
}

export interface EwayBillSettings {
  threshold: number;
  email: string;
}

export async function loadEwayBillSettings(supabase: SupabaseClient): Promise<EwayBillSettings> {
  const { data } = await supabase.from("platform_settings").select("eway_bill_threshold, eway_bill_email").maybeSingle();
  return {
    threshold: Number(data?.eway_bill_threshold ?? 50000),
    email: data?.eway_bill_email || "support@allboutiqs.com",
  };
}

export interface VendorEwayBillSetup {
  mode: "subuser" | "self";
  subuser_username: string | null;
  verified_at: string | null;
}

export async function loadVendorSetup(supabase: SupabaseClient, vendorId: string): Promise<VendorEwayBillSetup> {
  const { data } = await supabase
    .from("vendor_eway_bill_setup")
    .select("mode, subuser_username, verified_at")
    .eq("vendor_id", vendorId)
    .maybeSingle();
  return (data as VendorEwayBillSetup) ?? { mode: "subuser", subuser_username: null, verified_at: null };
}

// The date in India, for a document date.
const istDate = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

export const orderRef = (orderId: string) => `#${orderId.slice(0, 8).toUpperCase()}`;

// ---------- documents ----------

// The document a movement travels on, as the e-way bill names it.
export interface MovementDocument {
  type: EwayBill["document_type"];
  number: string;
  date: string;
  value: number;
  invoiceId: string | null;
  returnInvoiceId: string | null;
  challanId: string | null;
}

export const invoiceDocument = (invoice: any): MovementDocument => ({
  type: "tax_invoice",
  number: invoice.invoice_number,
  date: istDate(invoice.issued_at),
  value: Number(invoice.total),
  invoiceId: invoice.id,
  returnInvoiceId: null,
  challanId: null,
});

export const returnInvoiceDocument = (ri: any): MovementDocument => ({
  type: "return_invoice",
  number: ri.return_invoice_number,
  date: istDate(ri.issued_at),
  value: Number(ri.total),
  invoiceId: ri.invoice_id,
  returnInvoiceId: ri.id,
  challanId: null,
});

// A delivery challan for goods already covered by a tax invoice (onward to
// the customer) or a return invoice (onward to the boutique; back to the
// customer when a return failed inspection).
export async function createChallan(
  supabase: SupabaseClient,
  p: {
    vendorOrderId: string;
    purpose: "to_customer" | "return_to_customer" | "to_boutique";
    invoiceId: string | null;
    returnInvoiceId?: string | null;
    value: number;
    from: Party;
    to: Party;
    dispatchId?: string | null;
    returnRequestId?: string | null;
    sendBackId?: string | null;
  },
): Promise<MovementDocument> {
  const { data: vo, error: voErr } = await supabase
    .from("vendor_orders")
    .select("id, order_id, vendor_id")
    .eq("id", p.vendorOrderId)
    .single();
  if (voErr) throw voErr;
  const issuedAt = new Date().toISOString();
  const { data: number, error: numErr } = await supabase.rpc("next_boutique_challan_number", { _vendor_id: vo.vendor_id, _at: issuedAt });
  if (numErr) throw numErr;
  const { data: challan, error } = await supabase
    .from("delivery_challans")
    .insert({
      challan_number: number,
      vendor_order_id: vo.id,
      order_id: vo.order_id,
      vendor_id: vo.vendor_id,
      invoice_id: p.invoiceId,
      return_invoice_id: p.returnInvoiceId ?? null,
      purpose: p.purpose,
      dispatch_id: p.dispatchId ?? null,
      return_request_id: p.returnRequestId ?? null,
      send_back_id: p.sendBackId ?? null,
      issued_at: issuedAt,
      dispatch_from_name: p.from.name,
      dispatch_from_address: p.from.address,
      ship_to_name: p.to.name,
      ship_to_address: p.to.address,
      value: p.value,
      reason:
        p.purpose === "to_boutique"
          ? "Goods taken back by the boutique (return invoice), going on to it"
          : p.purpose === "return_to_customer"
            ? "The customer's own goods going back: the return failed inspection"
            : "Delivery of goods already invoiced to the customer",
    })
    .select("*")
    .single();
  if (error) throw error;
  return {
    type: "delivery_challan",
    number: challan.challan_number,
    date: istDate(issuedAt),
    value: p.value,
    invoiceId: p.invoiceId,
    returnInvoiceId: p.returnInvoiceId ?? null,
    challanId: challan.id,
  };
}

// The invoice total for the part (or what it will be) - the limit is
// checked on it unless the movement knows its own value.
async function invoiceValue(supabase: SupabaseClient, vendorOrderId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("vendor_order_invoice_value", { _vendor_order_id: vendorOrderId });
  if (error) throw error;
  return data == null ? null : Number(data);
}

// A request for this movement not yet used by a live booking (a cancelled
// booking frees it) - or made for this very booking (a return pickup).
async function findOpenEwayBill(
  supabase: SupabaseClient,
  vendorOrderId: string,
  leg: EwayBillLeg,
  movement: string,
  shipmentId?: string | null,
): Promise<EwayBill | null> {
  const { data } = await supabase
    .from("eway_bills")
    .select("*")
    .eq("vendor_order_id", vendorOrderId)
    .eq("leg", leg)
    .eq("movement", movement)
    .or(
      shipmentId
        ? `status.eq.pending,and(status.eq.active,or(shipment_id.is.null,shipment_id.eq.${shipmentId}))`
        : "status.eq.pending,and(status.eq.active,shipment_id.is.null)",
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as EwayBill) ?? null;
}

// What the booking screens show before booking - null when no e-way bill is
// needed. bill is null until the first booking attempt asks for one.
export async function ewayBillPreview(
  supabase: SupabaseClient,
  vendorOrderId: string,
  leg: EwayBillLeg,
  movement = "order",
  knownValue?: number | null,
) {
  const settings = await loadEwayBillSettings(supabase);
  const value = knownValue ?? (await invoiceValue(supabase, vendorOrderId));
  if (value == null || value <= settings.threshold) return null;
  const { data: vo } = await supabase.from("vendor_orders").select("order_id, vendor_id").eq("id", vendorOrderId).single();
  const [open, setup] = await Promise.all([
    findOpenEwayBill(supabase, vendorOrderId, leg, movement),
    loadVendorSetup(supabase, vo!.vendor_id),
  ]);
  return {
    vendor_order_id: vendorOrderId,
    order_id: vo!.order_id as string,
    value,
    threshold: settings.threshold,
    made_by: setup.mode === "self" ? "boutique" : "allboutiqs",
    email: settings.email,
    bill: open ? ewayBillSummary(open) : null,
    // A boutique making its own needs the courier's ID for Part B.
    transporter_id: open ? await transporterId(supabase, open.courier_id) : null,
  };
}

export type EwayBillCheck =
  | { required: false }
  | { required: true; ready: boolean; bill: EwayBill; created: boolean };

// The e-way bill a booking of this movement needs, if any. Throws
// InvoiceError when the document can't be issued (no GSTIN, no HSN...).
export async function ewayBillForBooking(
  supabase: SupabaseClient,
  p: {
    vendorOrderId: string;
    leg: EwayBillLeg;
    // 'order' for the part's own journey; see the eway_bills migration.
    movement?: string;
    courierId: number | null;
    courierName: string | null;
    from: Party;
    to: Party;
    // Known value of the goods moving; else the part's invoice value.
    value?: number | null;
    // Issues (or finds) the document - only called when one is needed.
    // Default: the part's tax invoice, or a delivery challan on it from the
    // warehouse to the customer.
    document?: () => Promise<MovementDocument>;
    // The invoice the goods stand on now: a request made on an older one is
    // replaced (a part sent again after its sale was undone).
    currentInvoiceId?: string | null;
    // A return pickup or RTO: the booking already exists, the e-way bill is
    // made for it.
    shipmentId?: string | null;
    dispatchId?: string | null;
    returnRequestId?: string | null;
    sendBackId?: string | null;
    // The courier isn't known when Shiprocket couldn't assign one.
    requireCourier?: boolean;
    requestedBy: string | null;
  },
): Promise<EwayBillCheck> {
  const movement = p.movement ?? "order";
  const settings = await loadEwayBillSettings(supabase);
  const estimate = p.value ?? (await invoiceValue(supabase, p.vendorOrderId));
  if (estimate == null || estimate <= settings.threshold) return { required: false };

  let open = await findOpenEwayBill(supabase, p.vendorOrderId, p.leg, movement, p.shipmentId);
  if (open && p.currentInvoiceId && open.document_type === "tax_invoice" && open.invoice_id !== p.currentInvoiceId) {
    await supabase
      .from("eway_bills")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Replaced: the goods go on a new invoice" })
      .eq("id", open.id);
    open = null;
  }
  if (open) {
    let bill = open;
    // Not made yet: it's made out to whichever courier was chosen last.
    if (bill.status === "pending" && p.courierId && p.courierId !== bill.courier_id) {
      const { data: updated } = await supabase
        .from("eway_bills")
        .update({ courier_id: p.courierId, courier_name: p.courierName, dispatch_id: p.dispatchId ?? bill.dispatch_id ?? null })
        .eq("id", bill.id)
        .select("*")
        .single();
      if (updated) bill = updated as EwayBill;
    }
    return { required: true, ready: bill.status === "active", bill, created: false };
  }

  if (!p.courierId && p.requireCourier !== false) {
    throw new InvoiceError("Choose a courier - the e-way bill is made out to it", 400);
  }

  const { data: vo, error: voErr } = await supabase
    .from("vendor_orders")
    .select("id, order_id, vendor_id")
    .eq("id", p.vendorOrderId)
    .single();
  if (voErr) throw voErr;

  const doc = p.document
    ? await p.document()
    : await (async () => {
        const { invoice } = await ensureInvoice(supabase, p.vendorOrderId);
        if (Number(invoice.total) <= settings.threshold || p.leg !== "warehouse_to_customer") return invoiceDocument(invoice);
        return createChallan(supabase, {
          vendorOrderId: p.vendorOrderId,
          purpose: "to_customer",
          invoiceId: invoice.id,
          value: Number(invoice.total),
          from: p.from,
          to: p.to,
          dispatchId: p.dispatchId,
        });
      })();
  if (doc.value <= settings.threshold) return { required: false };

  const { data: inserted, error: insertErr } = await supabase
    .from("eway_bills")
    .insert({
      order_id: vo.order_id,
      vendor_order_id: vo.id,
      vendor_id: vo.vendor_id,
      leg: p.leg,
      movement,
      document_type: doc.type,
      invoice_id: doc.invoiceId,
      return_invoice_id: doc.returnInvoiceId,
      challan_id: doc.challanId,
      document_number: doc.number,
      document_date: doc.date,
      value: doc.value,
      from_name: p.from.name,
      from_address: p.from.address,
      to_name: p.to.name,
      to_address: p.to.address,
      courier_id: p.courierId,
      courier_name: p.courierName,
      shipment_id: p.shipmentId ?? null,
      dispatch_id: p.dispatchId ?? null,
      return_request_id: p.returnRequestId ?? null,
      send_back_id: p.sendBackId ?? null,
      requested_by: p.requestedBy,
    })
    .select("*")
    .single();
  if (insertErr) {
    // Requested at the same moment by another click - use that one.
    if ((insertErr as { code?: string }).code === "23505") {
      if (doc.challanId) await supabase.from("delivery_challans").delete().eq("id", doc.challanId);
      const { data: raced } = await supabase
        .from("eway_bills")
        .select("*")
        .eq("vendor_order_id", p.vendorOrderId)
        .eq("leg", p.leg)
        .eq("movement", movement)
        .eq("status", "pending")
        .maybeSingle();
      if (raced) return { required: true, ready: false, bill: raced as EwayBill, created: false };
    }
    throw insertErr;
  }

  const bill = inserted as EwayBill;
  await announceRequest(supabase, bill, settings);
  return { required: true, ready: false, bill, created: true };
}

// The booking that used it - a later booking of this movement needs a new one.
export async function markEwayBillsUsed(supabase: SupabaseClient, billIds: string[], shipmentId: string) {
  if (!billIds.length) return;
  const { error } = await supabase.from("eway_bills").update({ shipment_id: shipmentId }).in("id", billIds);
  if (error) console.error("markEwayBillsUsed failed", error);
}

// What the booking screens show about an e-way bill request.
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
    courier_id: bill.courier_id,
    courier_name: bill.courier_name,
    ewb_number: bill.ewb_number,
    valid_until: bill.valid_until,
    requested_at: bill.created_at,
  };
}

// A customer's return pickup held for its e-way bills: once every one of them
// is in, ask Shiprocket to collect. Returns whether the pickup was requested.
export async function releaseHeldReturnPickup(supabase: SupabaseClient, shipmentId: string): Promise<boolean> {
  const { count } = await supabase
    .from("eway_bills")
    .select("id", { count: "exact", head: true })
    .eq("shipment_id", shipmentId)
    .eq("status", "pending");
  if (count) return false;
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, status, shiprocket_shipment_id, awb_code")
    .eq("id", shipmentId)
    .maybeSingle();
  if (!shipment?.shiprocket_shipment_id || !shipment.awb_code || shipment.status !== "awb_assigned") return false;
  await shiprocketRequest(supabase, "/courier/generate/pickup", {
    method: "POST",
    body: { shipment_id: [shipment.shiprocket_shipment_id] },
  });
  await supabase.from("shipments").update({ status: "pickup_scheduled" }).eq("id", shipment.id);
  return true;
}

// ---------- telling people ----------

type Kind = "forward" | "onward" | "return_pickup" | "rto" | "send_back" | "return_to_customer";

function kindOf(bill: Pick<EwayBill, "leg" | "movement">): Kind {
  if (bill.movement.startsWith("rto:")) return "rto";
  if (bill.leg === "customer_to_warehouse" || bill.leg === "customer_to_boutique") return "return_pickup";
  if (bill.leg === "warehouse_to_boutique") return "send_back";
  if (bill.leg === "warehouse_to_customer") return bill.movement.startsWith("return:") ? "return_to_customer" : "onward";
  return "forward";
}

// What happens once the number is in.
const NEXT_STEP: Record<Kind, string> = {
  forward: "you can book the courier",
  onward: "the parcel leaves the AllBoutiqs warehouse",
  return_pickup: "the courier collects the return from the customer",
  rto: "it's added to the courier's returning parcel",
  send_back: "the parcel is sent to you from the AllBoutiqs warehouse",
  return_to_customer: "the parcel goes back to the customer",
};

async function adminEmails(supabase: SupabaseClient): Promise<string[]> {
  const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const emails = await Promise.all(
    (roles ?? []).map(async (r) => {
      const { data } = await supabase.auth.admin.getUserById(r.user_id);
      return data?.user?.email ?? null;
    }),
  );
  return emails.filter((e): e is string => !!e);
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const addressText = (a: Record<string, unknown> | null) =>
  a
    ? [a.address_line1, a.address_line2, [a.city, a.state].filter(Boolean).join(", "), a.pincode ? `PIN ${a.pincode}` : null]
        .filter((l) => l && String(l).trim())
        .join(", ")
    : "";

async function transporterId(supabase: SupabaseClient, courierId: number | null): Promise<string | null> {
  if (!courierId) return null;
  const { data } = await supabase.from("courier_transporters").select("transporter_id").eq("courier_id", courierId).maybeSingle();
  return data?.transporter_id ?? null;
}

// The facts behind a request: transaction, parties, items and totals, from
// the document it travels on.
async function documentFacts(supabase: SupabaseClient, bill: EwayBill) {
  const { data: invoice } = bill.invoice_id
    ? await supabase.from("invoices").select("*").eq("id", bill.invoice_id).maybeSingle()
    : { data: null };
  let challanPurpose: string | null = null;
  let returnInvoiceId = bill.return_invoice_id;
  if (bill.challan_id) {
    const { data: challan } = await supabase.from("delivery_challans").select("purpose, return_invoice_id").eq("id", bill.challan_id).maybeSingle();
    challanPurpose = challan?.purpose ?? null;
    returnInvoiceId = returnInvoiceId ?? challan?.return_invoice_id ?? null;
  }
  const { data: returnInvoice } = returnInvoiceId
    ? await supabase.from("return_invoices").select("*").eq("id", returnInvoiceId).maybeSingle()
    : { data: null };
  const totalsFrom = returnInvoice ?? invoice;
  const { data: lines } = returnInvoice
    ? await supabase.from("return_invoice_lines").select("*").eq("return_invoice_id", returnInvoice.id).order("line_no")
    : await supabase.from("invoice_lines").select("*").eq("invoice_id", bill.invoice_id ?? "").order("line_no");
  // Goods coming back to the boutique: the customer is the consignor.
  const inward = bill.document_type === "return_invoice" || challanPurpose === "to_boutique";
  const transaction =
    bill.document_type === "return_invoice"
      ? "Inward - Sales Return"
      : challanPurpose === "to_boutique"
        ? `Inward - Sales Return (taken back on return invoice ${returnInvoice?.return_invoice_number ?? ""})`
        : challanPurpose === "return_to_customer"
          ? "Outward - Others (the customer's own goods going back)"
          : "Outward - Supply";
  return { invoice, lines: lines ?? [], totalsFrom, inward, transaction };
}

// Everything the portal's "Generate New" form asks for, as an email table.
async function detailsHtml(supabase: SupabaseClient, bill: EwayBill): Promise<string> {
  const { invoice, lines, totalsFrom, inward, transaction } = await documentFacts(supabase, bill);
  const transporter = await transporterId(supabase, bill.courier_id);
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 8px 4px 0; color:#8a8a8a; vertical-align:top; white-space:nowrap;">${esc(label)}</td><td style="padding:4px 0;">${value}</td></tr>`;
  const intra = invoice?.supply_type === "intra_state";
  const items = lines
    .map(
      (l: any) =>
        `${esc(l.description)} - HSN ${esc(l.hsn_code ?? "-")}, qty ${l.quantity}, taxable ${esc(money(l.taxable_value))}, GST ${Number(l.gst_rate)}%`,
    )
    .join("<br>");
  const boutique = `${esc(invoice?.seller_legal_name ?? invoice?.seller_name ?? "")}, GSTIN <strong>${esc(invoice?.seller_gstin ?? "")}</strong>`;
  const customer = `${esc(invoice?.billing_name ?? "")} (unregistered - URP), ${esc(invoice?.billing_state ?? "")}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="background:#f9f6f2; border-radius:8px; padding:12px 16px; margin:16px 0; font-size:13px; width:100%;">
    ${row("Transaction", esc(transaction))}
    ${row("Document", `${DOCUMENT_LABELS[bill.document_type]} <strong>${esc(bill.document_number)}</strong>, ${esc(formatDate(bill.document_date))}`)}
    ${row("Bill from", inward ? customer : boutique)}
    ${row("Dispatch from", `${esc(bill.from_name)}, ${esc(addressText(bill.from_address))}`)}
    ${row("Bill to", inward ? boutique : customer)}
    ${row("Ship to", `${esc(bill.to_name)}, ${esc(addressText(bill.to_address))}`)}
    ${row("Items", items)}
    ${row(
      "Totals",
      `Taxable ${esc(money(totalsFrom?.taxable_value))}, ${
        intra
          ? `CGST ${esc(money(totalsFrom?.cgst_amount))}, SGST ${esc(money(totalsFrom?.sgst_amount))}`
          : `IGST ${esc(money(totalsFrom?.igst_amount))}`
      }, <strong>total ${esc(money(bill.value))}</strong>`,
    )}
    ${row("Transporter", `${esc(bill.courier_name ?? "-")}${transporter ? `, transporter ID <strong>${esc(transporter)}</strong>` : " (transporter ID: ask AllBoutiqs)"} - mode Road, leave the vehicle number blank`)}
  </table>`;
}

async function announceRequest(supabase: SupabaseClient, bill: EwayBill, settings: EwayBillSettings) {
  try {
    const [{ data: vendor }, setup] = await Promise.all([
      supabase.from("vendors").select("name, contact_email").eq("id", bill.vendor_id).single(),
      loadVendorSetup(supabase, bill.vendor_id),
    ]);
    const ref = orderRef(bill.order_id);
    const boutique = vendor?.name ?? "A boutique";
    const bySelf = setup.mode === "self";
    const kind = kindOf(bill);
    const next = NEXT_STEP[kind];
    const who = bySelf
      ? "The boutique makes this one itself and emails the number."
      : setup.subuser_username
        ? `Portal sub-user: ${setup.subuser_username}${setup.verified_at ? "" : " (not checked yet)"}.`
        : "This boutique hasn't set up its portal sub-user yet.";
    const rtoNote = kind === "rto" ? " The parcel is already on its way back: upload the number on Shiprocket's RTO order." : "";
    const details = await detailsHtml(supabase, bill);

    await notifyAllAdmins(supabase, {
      type: "eway_bill_needed",
      title: "E-way bill needed",
      body: `${boutique} - order ${ref}, ${LEG_LABELS[bill.leg].toLowerCase()}, ${money(bill.value)}, courier ${bill.courier_name ?? "-"}. ${who}${rtoNote}`,
      link: links.adminEwayBill(bill.id),
      category: "order",
    });

    const adminHtml = emailTemplate({
      heading: "E-way bill needed",
      preheader: `${boutique} - order ${ref} - ${money(bill.value)}`,
      bodyHtml: `<p>Order <strong>${esc(ref)}</strong> from ${esc(boutique)} - ${esc(LEG_LABELS[bill.leg].toLowerCase())} - is over ${esc(money(settings.threshold))}, so it needs an e-way bill. Once its number is entered, ${esc(next)}.${esc(rtoNote)}</p>
        <p>${esc(who)}</p>
        ${details}`,
      ctaLabel: "Open E-way bills",
      ctaUrl: `https://allboutiqs.com${links.adminEwayBill(bill.id)}`,
    });
    for (const email of await adminEmails(supabase)) {
      await sendEmail(email, `E-way bill needed - ${boutique} - order ${ref}`, adminHtml).catch((e) =>
        console.error("eway bill: admin email failed", email, errorMessage(e)),
      );
    }

    await notifyVendorMembers(supabase, bill.vendor_id, {
      type: "eway_bill_needed",
      title: bySelf ? "Make the e-way bill for this order" : "E-way bill in progress",
      body: bySelf
        ? `Order ${ref} (${LEG_LABELS[bill.leg].toLowerCase()}) is over ${money(settings.threshold)}, so it needs an e-way bill. Make it on ewaybillgst.gov.in (details are in your email) and email the 12-digit number and its PDF to ${settings.email}. Once we enter it, ${next}.`
        : `Order ${ref} (${LEG_LABELS[bill.leg].toLowerCase()}) is over ${money(settings.threshold)}, so it needs an e-way bill. AllBoutiqs is making it - once it's in, ${next}.`,
      link: links.vendorOrder(bill.vendor_order_id),
    });

    if (bySelf && vendor?.contact_email) {
      await sendEmail(vendor.contact_email, `E-way bill needed - order ${ref} - ${bill.document_number}`, requestEmailHtml(bill, settings, details)).catch(
        (e) => console.error("eway bill: boutique email failed", errorMessage(e)),
      );
    }
  } catch (e) {
    // Never blocks the request itself - the admin list shows it either way.
    console.error("eway bill: announcing the request failed", errorMessage(e));
  }
}

function requestEmailHtml(bill: EwayBill, settings: EwayBillSettings, details: string, reminder = false) {
  const ref = orderRef(bill.order_id);
  return emailTemplate({
    heading: "Please make the e-way bill",
    preheader: `Order ${ref} needs an e-way bill`,
    bodyHtml: `<p>${reminder ? "A reminder: order" : "Order"} <strong>${esc(ref)}</strong> is over ${esc(money(settings.threshold))}, so the goods need an e-way bill (${esc(LEG_LABELS[bill.leg].toLowerCase())}).</p>
      <p>Please make it on <a href="https://ewaybillgst.gov.in" style="color:#7a2e22;">ewaybillgst.gov.in</a> with these details:</p>
      ${details}
      <p>Then email the <strong>12-digit e-way bill number</strong> and its <strong>PDF</strong> to <a href="mailto:${esc(settings.email)}" style="color:#7a2e22;">${esc(settings.email)}</a> with the subject <strong>EWB - Order ${esc(ref)} - ${esc(bill.document_number)}</strong>. Once we enter it, ${esc(NEXT_STEP[kindOf(bill)])}.</p>`,
    ctaLabel: "Open the order",
    ctaUrl: `https://allboutiqs.com${links.vendorOrder(bill.vendor_order_id)}`,
  });
}

// Sent again from the admin page (a boutique that makes its own lost the email).
export async function resendRequestEmail(supabase: SupabaseClient, bill: EwayBill): Promise<string> {
  const settings = await loadEwayBillSettings(supabase);
  const { data: vendor } = await supabase.from("vendors").select("contact_email").eq("id", bill.vendor_id).single();
  if (!vendor?.contact_email) throw new InvoiceError("This boutique has no contact email", 400);
  await sendEmail(
    vendor.contact_email,
    `E-way bill needed - order ${orderRef(bill.order_id)} - ${bill.document_number}`,
    requestEmailHtml(bill, settings, await detailsHtml(supabase, bill), true),
  );
  return vendor.contact_email;
}

// The number is in: tell whoever books the parcel.
export async function announceReady(supabase: SupabaseClient, bill: EwayBill) {
  const ref = orderRef(bill.order_id);
  const kind = kindOf(bill);
  try {
    if (kind === "onward" || kind === "return_to_customer" || kind === "send_back") {
      await supabase.rpc("notify_warehouse", {
        _type: "eway_bill_ready",
        _title: "E-way bill ready - book the parcel",
        _body: `E-way bill ${bill.ewb_number} for order ${ref} (${LEG_LABELS[bill.leg].toLowerCase()}) is in. Book the parcel with ${bill.courier_name ?? "the same courier"}.`,
        _link: kind === "send_back" ? `/warehouse?tab=sendbacks&focus=${bill.send_back_id}` : `/warehouse?tab=pack&focus=${bill.order_id}`,
      });
      return;
    }
    if (kind !== "forward") return; // return pickups and RTO need no one to act
    await notifyVendorMembers(supabase, bill.vendor_id, {
      type: "eway_bill_ready",
      title: "E-way bill ready - ship the order",
      body: `E-way bill ${bill.ewb_number} for order ${ref} is ready. Press Ship Now to book ${bill.courier_name ?? "the courier"} and print the label.`,
      link: links.vendorOrder(bill.vendor_order_id),
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
          }.</p><p>Press <strong>Ship Now</strong> to book ${esc(bill.courier_name ?? "the courier")} - the e-way bill is made out to it - and print the label. Put the invoice in the parcel.</p>`,
          ctaLabel: "Ship the order",
          ctaUrl: `https://allboutiqs.com${links.vendorOrder(bill.vendor_order_id)}`,
        }),
      );
    }
  } catch (e) {
    console.error("eway bill: announcing the number failed", errorMessage(e));
  }
}
