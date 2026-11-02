import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ensureInvoice, InvoiceError } from "./invoice.ts";
import { links, notifyAllAdmins, notifyVendorMembers } from "./notify.ts";
import { emailTemplate, sendEmail } from "./email.ts";
import { money } from "./money.ts";
import { formatDate, formatDateTime } from "./dates.ts";
import { errorMessage } from "./auth.ts";

// E-way bills for parcels over the limit (see the eway_bills migration).
// Before any courier booking of a boutique part, the booking function asks
// ewayBillForBooking: below the limit nothing changes; above it the first
// attempt issues the document (tax invoice / delivery challan), records an
// e-way bill request for the courier chosen and tells AllBoutiqs (or the
// boutique, if it makes its own); the booking goes ahead only once an admin
// has typed the number in, with the courier the e-way bill is made out to.

export type EwayBillLeg = "boutique_to_customer" | "boutique_to_warehouse" | "warehouse_to_customer";

export const LEG_LABELS: Record<EwayBillLeg, string> = {
  boutique_to_customer: "Boutique to customer",
  boutique_to_warehouse: "Boutique to AllBoutiqs warehouse",
  warehouse_to_customer: "AllBoutiqs warehouse to customer",
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

// The invoice total for the part (or what it will be) - the limit is checked on it.
async function invoiceValue(supabase: SupabaseClient, vendorOrderId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("vendor_order_invoice_value", { _vendor_order_id: vendorOrderId });
  if (error) throw error;
  return data == null ? null : Number(data);
}

// A request not yet used by a live booking (a cancelled booking frees it).
async function findOpenEwayBill(supabase: SupabaseClient, vendorOrderId: string, leg: EwayBillLeg): Promise<EwayBill | null> {
  const { data } = await supabase
    .from("eway_bills")
    .select("*")
    .eq("vendor_order_id", vendorOrderId)
    .eq("leg", leg)
    .or("status.eq.pending,and(status.eq.active,shipment_id.is.null)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as EwayBill) ?? null;
}

// What the booking screens show before booking - null when no e-way bill is
// needed. bill is null until the first booking attempt asks for one.
export async function ewayBillPreview(supabase: SupabaseClient, vendorOrderId: string, leg: EwayBillLeg) {
  const settings = await loadEwayBillSettings(supabase);
  const value = await invoiceValue(supabase, vendorOrderId);
  if (value == null || value <= settings.threshold) return null;
  const { data: vo } = await supabase.from("vendor_orders").select("order_id, vendor_id").eq("id", vendorOrderId).single();
  const [open, setup] = await Promise.all([findOpenEwayBill(supabase, vendorOrderId, leg), loadVendorSetup(supabase, vo!.vendor_id)]);
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

// The e-way bill a booking of this leg needs, if any. Throws InvoiceError
// when the document can't be issued (no GSTIN, no HSN...).
export async function ewayBillForBooking(
  supabase: SupabaseClient,
  p: {
    vendorOrderId: string;
    leg: EwayBillLeg;
    courierId: number | null;
    courierName: string | null;
    from: Party;
    to: Party;
    dispatchId?: string | null;
    requestedBy: string;
  },
): Promise<EwayBillCheck> {
  const settings = await loadEwayBillSettings(supabase);
  const estimate = await invoiceValue(supabase, p.vendorOrderId);
  if (estimate == null || estimate <= settings.threshold) return { required: false };

  const open = await findOpenEwayBill(supabase, p.vendorOrderId, p.leg);
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

  if (!p.courierId) throw new InvoiceError("Choose a courier - the e-way bill is made out to it", 400);

  const { data: vo, error: voErr } = await supabase
    .from("vendor_orders")
    .select("id, order_id, vendor_id")
    .eq("id", p.vendorOrderId)
    .single();
  if (voErr) throw voErr;

  // The goods travel on the tax invoice from the boutique, on a delivery
  // challan from the warehouse.
  const { invoice } = await ensureInvoice(supabase, p.vendorOrderId);
  const value = Number(invoice.total);
  if (value <= settings.threshold) return { required: false };

  let documentType: EwayBill["document_type"] = "tax_invoice";
  let documentNumber: string = invoice.invoice_number;
  let documentDate = istDate(invoice.issued_at);
  let challanId: string | null = null;
  if (p.leg === "warehouse_to_customer") {
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
        dispatch_id: p.dispatchId ?? null,
        issued_at: issuedAt,
        dispatch_from_name: p.from.name,
        dispatch_from_address: p.from.address,
        ship_to_name: p.to.name,
        ship_to_address: p.to.address,
        value,
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
      leg: p.leg,
      document_type: documentType,
      invoice_id: invoice.id,
      challan_id: challanId,
      document_number: documentNumber,
      document_date: documentDate,
      value,
      from_name: p.from.name,
      from_address: p.from.address,
      to_name: p.to.name,
      to_address: p.to.address,
      courier_id: p.courierId,
      courier_name: p.courierName,
      dispatch_id: p.dispatchId ?? null,
      requested_by: p.requestedBy,
    })
    .select("*")
    .single();
  if (insertErr) {
    // Requested at the same moment by another click - use that one.
    if ((insertErr as { code?: string }).code === "23505") {
      if (challanId) await supabase.from("delivery_challans").delete().eq("id", challanId);
      const { data: raced } = await supabase
        .from("eway_bills")
        .select("*")
        .eq("vendor_order_id", p.vendorOrderId)
        .eq("leg", p.leg)
        .eq("status", "pending")
        .maybeSingle();
      if (raced) return { required: true, ready: false, bill: raced as EwayBill, created: false };
    }
    throw insertErr;
  }

  const bill = inserted as EwayBill;
  await announceRequest(supabase, bill, invoice, settings);
  return { required: true, ready: false, bill, created: true };
}

// The booking that used it - a later booking of this leg needs a new one.
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

// ---------- telling people ----------

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

// Everything the portal's "Generate New" form asks for, as an email table.
async function detailsHtml(supabase: SupabaseClient, bill: EwayBill, invoice: any): Promise<string> {
  const { data: lines } = await supabase
    .from("invoice_lines")
    .select("description, hsn_code, quantity, taxable_value, gst_rate")
    .eq("invoice_id", invoice.id)
    .order("line_no");
  const transporter = await transporterId(supabase, bill.courier_id);
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 8px 4px 0; color:#8a8a8a; vertical-align:top; white-space:nowrap;">${esc(label)}</td><td style="padding:4px 0;">${value}</td></tr>`;
  const intra = invoice.supply_type === "intra_state";
  const items = (lines ?? [])
    .map(
      (l) =>
        `${esc(l.description)} - HSN ${esc(l.hsn_code ?? "-")}, qty ${l.quantity}, taxable ${esc(money(l.taxable_value))}, GST ${Number(l.gst_rate)}%`,
    )
    .join("<br>");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="background:#f9f6f2; border-radius:8px; padding:12px 16px; margin:16px 0; font-size:13px; width:100%;">
    ${row("Transaction", "Outward - Supply")}
    ${row("Document", `${bill.document_type === "tax_invoice" ? "Tax Invoice" : "Delivery Challan"} <strong>${esc(bill.document_number)}</strong>, ${esc(formatDate(bill.document_date))}`)}
    ${row("Bill from", `${esc(invoice.seller_legal_name ?? invoice.seller_name)}, GSTIN <strong>${esc(invoice.seller_gstin)}</strong>`)}
    ${row("Dispatch from", `${esc(bill.from_name)}, ${esc(addressText(bill.from_address))}`)}
    ${row("Bill to", `${esc(invoice.billing_name)} (unregistered - URP), ${esc(invoice.billing_state ?? "")}`)}
    ${row("Ship to", `${esc(bill.to_name)}, ${esc(addressText(bill.to_address))}`)}
    ${row("Items", items)}
    ${row(
      "Totals",
      `Taxable ${esc(money(invoice.taxable_value))}, ${
        intra ? `CGST ${esc(money(invoice.cgst_amount))}, SGST ${esc(money(invoice.sgst_amount))}` : `IGST ${esc(money(invoice.igst_amount))}`
      }, <strong>total ${esc(money(bill.value))}</strong>`,
    )}
    ${row("Transporter", `${esc(bill.courier_name ?? "-")}${transporter ? `, transporter ID <strong>${esc(transporter)}</strong>` : " (transporter ID: ask AllBoutiqs)"} - mode Road, leave the vehicle number blank`)}
  </table>`;
}

async function announceRequest(supabase: SupabaseClient, bill: EwayBill, invoice: any, settings: EwayBillSettings) {
  try {
    const [{ data: vendor }, setup] = await Promise.all([
      supabase.from("vendors").select("name, contact_email").eq("id", bill.vendor_id).single(),
      loadVendorSetup(supabase, bill.vendor_id),
    ]);
    const ref = orderRef(bill.order_id);
    const boutique = vendor?.name ?? "A boutique";
    const bySelf = setup.mode === "self";
    const who = bySelf
      ? "The boutique makes this one itself and emails the number."
      : setup.subuser_username
        ? `Portal sub-user: ${setup.subuser_username}${setup.verified_at ? "" : " (not checked yet)"}.`
        : "This boutique hasn't set up its portal sub-user yet.";

    await notifyAllAdmins(supabase, {
      type: "eway_bill_needed",
      title: "E-way bill needed",
      body: `${boutique} - order ${ref}, ${LEG_LABELS[bill.leg].toLowerCase()}, ${money(bill.value)}, courier ${bill.courier_name ?? "-"}. ${who}`,
      link: links.adminEwayBill(bill.id),
      category: "order",
    });

    const adminHtml = emailTemplate({
      heading: "E-way bill needed",
      preheader: `${boutique} - order ${ref} - ${money(bill.value)}`,
      bodyHtml: `<p>${esc(boutique)} wants to ship order <strong>${esc(ref)}</strong> (${esc(LEG_LABELS[bill.leg].toLowerCase())}). It is over ${esc(money(settings.threshold))}, so the courier can't be booked until its e-way bill number is entered.</p>
        <p>${esc(who)}</p>
        ${await detailsHtml(supabase, bill, invoice)}`,
      ctaLabel: "Open E-way bills",
      ctaUrl: `https://allboutiqs.com${links.adminEwayBill(bill.id)}`,
    });
    for (const email of await adminEmails(supabase)) {
      await sendEmail(email, `E-way bill needed - ${boutique} - order ${ref}`, adminHtml).catch((e) =>
        console.error("eway bill: admin email failed", email, errorMessage(e)),
      );
    }

    const waiting = bill.leg === "warehouse_to_customer" ? "the parcel leaves the AllBoutiqs warehouse" : "you can book the courier";
    await notifyVendorMembers(supabase, bill.vendor_id, {
      type: "eway_bill_needed",
      title: bySelf ? "Make the e-way bill for this order" : "E-way bill in progress",
      body: bySelf
        ? `Order ${ref} is over ${money(settings.threshold)}, so it needs an e-way bill. Make it on ewaybillgst.gov.in (details are in your email) and email the 12-digit number and its PDF to ${settings.email}. Once we enter it, ${waiting}.`
        : `Order ${ref} is over ${money(settings.threshold)}, so it needs an e-way bill. AllBoutiqs is making it - we'll tell you when it's ready, then ${waiting}.`,
      link: links.vendorOrder(bill.vendor_order_id),
    });

    if (bySelf && vendor?.contact_email) {
      const html = emailTemplate({
        heading: "Please make the e-way bill",
        preheader: `Order ${ref} needs an e-way bill`,
        bodyHtml: `<p>Order <strong>${esc(ref)}</strong> is over ${esc(money(settings.threshold))}, so the goods need an e-way bill (${esc(LEG_LABELS[bill.leg].toLowerCase())}).</p>
          <p>Please make it on <a href="https://ewaybillgst.gov.in" style="color:#7a2e22;">ewaybillgst.gov.in</a> with these details:</p>
          ${await detailsHtml(supabase, bill, invoice)}
          <p>Then email the <strong>12-digit e-way bill number</strong> and its <strong>PDF</strong> to <a href="mailto:${esc(settings.email)}" style="color:#7a2e22;">${esc(settings.email)}</a> with the subject <strong>EWB - Order ${esc(ref)} - ${esc(bill.document_number)}</strong>. Once we enter it, ${esc(waiting)}.</p>`,
        ctaLabel: "Open the order",
        ctaUrl: `https://allboutiqs.com${links.vendorOrder(bill.vendor_order_id)}`,
      });
      await sendEmail(vendor.contact_email, `E-way bill needed - order ${ref} - ${bill.document_number}`, html).catch((e) =>
        console.error("eway bill: boutique email failed", errorMessage(e)),
      );
    }
  } catch (e) {
    // Never blocks the request itself - the admin list shows it either way.
    console.error("eway bill: announcing the request failed", errorMessage(e));
  }
}

// Sent again from the admin page (a boutique that makes its own lost the email).
export async function resendRequestEmail(supabase: SupabaseClient, bill: EwayBill): Promise<string> {
  const settings = await loadEwayBillSettings(supabase);
  const { data: vendor } = await supabase.from("vendors").select("contact_email").eq("id", bill.vendor_id).single();
  if (!vendor?.contact_email) throw new InvoiceError("This boutique has no contact email", 400);
  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", bill.invoice_id).single();
  const ref = orderRef(bill.order_id);
  const html = emailTemplate({
    heading: "Please make the e-way bill",
    preheader: `Order ${ref} needs an e-way bill`,
    bodyHtml: `<p>A reminder: order <strong>${esc(ref)}</strong> needs an e-way bill (${esc(LEG_LABELS[bill.leg].toLowerCase())}). Please make it on <a href="https://ewaybillgst.gov.in" style="color:#7a2e22;">ewaybillgst.gov.in</a> with these details:</p>
      ${await detailsHtml(supabase, bill, invoice)}
      <p>Then email the 12-digit number and its PDF to <a href="mailto:${esc(settings.email)}" style="color:#7a2e22;">${esc(settings.email)}</a> with the subject <strong>EWB - Order ${esc(ref)} - ${esc(bill.document_number)}</strong>.</p>`,
  });
  await sendEmail(vendor.contact_email, `E-way bill needed - order ${ref} - ${bill.document_number}`, html);
  return vendor.contact_email;
}

// The number is in: the parcel can be booked.
export async function announceReady(supabase: SupabaseClient, bill: EwayBill) {
  const ref = orderRef(bill.order_id);
  try {
    if (bill.leg === "warehouse_to_customer") {
      await supabase.rpc("notify_warehouse", {
        _type: "eway_bill_ready",
        _title: "E-way bill ready - book the parcel",
        _body: `E-way bill ${bill.ewb_number} for order ${ref} is in. Book the parcel with ${bill.courier_name ?? "the same courier"}.`,
        _link: `/warehouse?tab=pack&focus=${bill.order_id}`,
      });
      return;
    }
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
