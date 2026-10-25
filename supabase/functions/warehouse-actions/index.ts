import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  errorMessage,
  ensureWarehousePickupLocation,
  checkCourierServiceability,
  computeTotalWeightKg,
  bookForwardShipment,
  bookedCourierCost,
  cancelOrphanedShiprocketOrder,
  cancelBookingRow,
  Consignee,
  ForwardBookingItem,
  WarehouseRow,
} from "../_shared/shiprocket.ts";
import { addWorkingDays, getWarehouse, istToday, loadHolidays, loadWarehouseSettings, PARCEL_DEFAULTS, toShiprocketItems } from "../_shared/warehouse.ts";
import { executeRefund, RefundValidationError } from "../_shared/refunds.ts";
import { cancelOneVendorOrder } from "../_shared/cancellation.ts";
import { links, notifyAllAdmins, notifyVendorMembers } from "../_shared/notify.ts";

// The warehouse's own steps that need the courier or the payment gateway
// (receiving, inspecting boutique parcels and packing are plain database RPCs
// - see the warehouse_logistics migration):
//
//   parcel_rates              couriers + fares from the warehouse for a parcel
//   book_dispatch             book the warehouse's parcel to the customer
//   cancel_dispatch_booking   undo that booking (before pickup) to rebook
//   book_send_back            book items back to a boutique
//   cancel_send_back_booking  undo that booking (before pickup)
//   return_qc                 inspect a customer return: pass -> refund + forward
//                             to the boutique; fail -> send back to the customer
//   replacement_qc            inspect an exchange replacement from the boutique
//   resolve_qc_failure        admin: a boutique item failed inspection - cancel
//                             and refund it (default), or ask for a replacement
//   rto_cancel                admin: an undelivered parcel is back - cancel the
//                             order and send the items back to the boutiques
//
// Callers: admins and warehouse staff (admin-only where marked).

class ActionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Db = SupabaseClient;

interface ParcelPlan {
  warehouse: WarehouseRow;
  consignee: Consignee;
  items: ForwardBookingItem[];
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  cod: boolean;
  subTotal: number;
  shippingCharges: number;
  totalDiscount: number;
  orderDate: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function canOperate(supabase: Db, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("can_operate_warehouse", { _user_id: userId });
  return data === true;
}

// ---------- parcels ----------

async function loadDispatchPlan(supabase: Db, dispatchId: string) {
  const { data: dispatch, error } = await supabase
    .from("warehouse_dispatches")
    .select("id, order_id, warehouse_id, purpose, return_request_id, status, weight_kg, length_cm, breadth_cm, height_cm")
    .eq("id", dispatchId)
    .maybeSingle();
  if (error) throw error;
  if (!dispatch) throw new ActionError("Parcel not found", 404);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, customer_name, customer_email, customer_phone, shipping_address, payment_method, created_at, subtotal, discount_amount")
    .eq("id", dispatch.order_id)
    .single();
  if (orderErr) throw orderErr;

  const warehouse = await getWarehouse(supabase, dispatch.warehouse_id);
  let items: ForwardBookingItem[];
  let cod = false;
  let subTotal = 0;
  let shippingCharges = 0;
  let totalDiscount = 0;
  let leadVendorOrderId: string | null = null;

  if (dispatch.purpose === "order") {
    const { data: vendorOrders } = await supabase
      .from("vendor_orders")
      .select("id, subtotal, shipping_cost")
      .eq("dispatch_id", dispatch.id)
      .order("id");
    if (!vendorOrders?.length) throw new ActionError("This parcel is empty");
    leadVendorOrderId = vendorOrders[0].id;
    const { data: lines } = await supabase
      .from("order_items")
      .select("id, product_id, variant_id, product_title, variant_title, sku, quantity, price, discount_amount")
      .in("vendor_order_id", vendorOrders.map((v) => v.id));
    items = await toShiprocketItems(supabase, (lines ?? []).map((l) => ({ ...l, order_item_id: l.id })));
    subTotal = vendorOrders.reduce((sum, v) => sum + Number(v.subtotal), 0);
    shippingCharges = vendorOrders.reduce((sum, v) => sum + Number(v.shipping_cost), 0);
    // Cash on Delivery collects what the customer owes for exactly these
    // parts: their prices + delivery charge, less their share of a coupon -
    // what checkout recorded on their lines, or (older orders) the order's
    // discount shared by value.
    cod = order.payment_method === "cod";
    const orderSubtotal = Number(order.subtotal);
    totalDiscount = (lines ?? []).some((l) => l.discount_amount != null)
      ? round2((lines ?? []).reduce((sum, l) => sum + Number(l.discount_amount ?? 0), 0))
      : Number(order.discount_amount) > 0 && orderSubtotal > 0
        ? round2((Number(order.discount_amount) * subTotal) / orderSubtotal)
        : 0;
  } else {
    const { data: rr } = await supabase.from("return_requests").select("items").eq("id", dispatch.return_request_id).single();
    const rrItems = (rr?.items ?? []) as any[];
    const { data: lines } = await supabase
      .from("order_items")
      .select("id, product_id, variant_id, product_title, variant_title, sku, quantity, price")
      .in("id", rrItems.map((i) => i.order_item_id).filter(Boolean));
    const byId = new Map((lines ?? []).map((l) => [l.id, l]));
    const resolved = await toShiprocketItems(
      supabase,
      rrItems
        .filter((i) => byId.has(i.order_item_id))
        .map((i) => ({ ...byId.get(i.order_item_id)!, order_item_id: i.order_item_id, quantity: i.quantity })),
    );
    items = resolved.map((item, idx) => {
      const rrItem = rrItems.filter((i) => byId.has(i.order_item_id))[idx];
      if (dispatch.purpose !== "exchange_replacement") return item;
      const wanted = [rrItem?.exchange_to?.size, rrItem?.exchange_to?.color].filter(Boolean).join(" / ");
      return { ...item, name: `${item.name} - replacement${wanted ? ` (${wanted})` : ""}` };
    });
    subTotal = items.reduce((sum, i) => sum + i.selling_price * i.units, 0);
  }

  const plan: ParcelPlan = {
    warehouse,
    consignee: {
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      address: order.shipping_address as any,
    },
    items,
    weightKg: Number(dispatch.weight_kg),
    lengthCm: Number(dispatch.length_cm),
    breadthCm: Number(dispatch.breadth_cm),
    heightCm: Number(dispatch.height_cm),
    cod,
    subTotal,
    shippingCharges,
    totalDiscount,
    orderDate: order.created_at,
  };
  return { dispatch, order, plan, leadVendorOrderId };
}

async function loadSendBackPlan(supabase: Db, sendBackId: string) {
  const { data: sendBack, error } = await supabase
    .from("boutique_send_backs")
    .select("id, warehouse_id, vendor_id, order_id, vendor_order_id, return_request_id, reason, items, status, created_at")
    .eq("id", sendBackId)
    .maybeSingle();
  if (error) throw error;
  if (!sendBack) throw new ActionError("Send-back not found", 404);

  const { data: vendor, error: vendorErr } = await supabase
    .from("vendors")
    .select("id, name, contact_email, contact_phone, address")
    .eq("id", sendBack.vendor_id)
    .single();
  if (vendorErr) throw vendorErr;
  const address = (vendor.address ?? {}) as Record<string, string>;
  if (!address.address_line1 || !address.pincode || !vendor.contact_phone) {
    throw new ActionError(`${vendor.name}'s address or phone is incomplete - ask them to complete Store Settings`);
  }

  const lines = ((sendBack.items ?? []) as any[]).map((i) => ({
    order_item_id: i.order_item_id,
    product_id: i.product_id,
    variant_id: null,
    product_title: i.product_title,
    variant_title: [i.size, i.color].filter(Boolean).join(" / ") || null,
    sku: i.sku ?? null,
    quantity: Number(i.quantity ?? 1),
    price: Number(i.price ?? 0),
  }));
  if (lines.length === 0) throw new ActionError("Nothing to send back");
  const items = await toShiprocketItems(supabase, lines);

  const plan: ParcelPlan = {
    warehouse: await getWarehouse(supabase, sendBack.warehouse_id),
    consignee: {
      name: vendor.name,
      email: vendor.contact_email || "orders@allboutiqs.com",
      phone: vendor.contact_phone,
      address: vendor.address as any,
    },
    items,
    weightKg: await computeTotalWeightKg(supabase, lines),
    lengthCm: PARCEL_DEFAULTS.lengthCm,
    breadthCm: PARCEL_DEFAULTS.breadthCm,
    heightCm: PARCEL_DEFAULTS.heightCm,
    cod: false,
    subTotal: items.reduce((sum, i) => sum + i.selling_price * i.units, 0),
    shippingCharges: 0,
    totalDiscount: 0,
    orderDate: sendBack.created_at,
  };
  return { sendBack, plan };
}

async function ratesFor(supabase: Db, plan: ParcelPlan) {
  return checkCourierServiceability(supabase, {
    pickupPincode: plan.warehouse.address.pincode ?? "",
    deliveryPincode: plan.consignee.address.pincode ?? "",
    cod: plan.cod,
    weightKg: plan.weightKg,
  });
}

async function bookFromWarehouse(
  supabase: Db,
  plan: ParcelPlan,
  channelPrefix: string,
  courierId: number | null,
  row: Record<string, unknown>,
) {
  const pickup = await ensureWarehousePickupLocation(supabase, plan.warehouse);
  const channelOrderId = `${channelPrefix}-${Date.now()}`;
  const booking = await bookForwardShipment(supabase, {
    channelOrderId,
    orderDate: plan.orderDate,
    pickupLocationName: pickup.name,
    consignee: plan.consignee,
    items: plan.items,
    cod: plan.cod,
    subTotal: plan.subTotal,
    shippingCharges: plan.shippingCharges,
    totalDiscount: plan.totalDiscount,
    weightKg: plan.weightKg,
    lengthCm: plan.lengthCm,
    breadthCm: plan.breadthCm,
    heightCm: plan.heightCm,
    courierId,
  });
  const courierCost = await bookedCourierCost(supabase, {
    pickupPincode: plan.warehouse.address.pincode ?? "",
    deliveryPincode: plan.consignee.address.pincode ?? "",
    cod: plan.cod,
    weightKg: plan.weightKg,
    courierId: booking.courierId,
  });
  const { data: shipment, error } = await supabase
    .from("shipments")
    .insert({
      ...row,
      warehouse_id: plan.warehouse.id,
      shiprocket_channel_order_id: channelOrderId,
      shiprocket_order_id: booking.orderId,
      shiprocket_shipment_id: booking.shipmentId,
      awb_code: booking.awbCode,
      courier_id: booking.courierId,
      courier_name: booking.courierName,
      status: booking.awbCode ? "awb_assigned" : "pending",
      label_url: booking.labelUrl,
      manifest_url: booking.manifestUrl,
      courier_cost: courierCost,
    })
    .select()
    .single();
  if (error) {
    await cancelOrphanedShiprocketOrder(supabase, booking.orderId);
    throw error;
  }
  return shipment;
}

// A booking that's dead (courier dropped it) is cleared so the leg can be
// booked again; a live one means "already booked".
async function liveBooking(supabase: Db, column: "dispatch_id" | "send_back_id", id: string) {
  const { data: existing } = await supabase
    .from("shipments")
    .select("id, awb_code, shiprocket_order_id, status, courier_name, label_url")
    .eq(column, id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!existing) return null;
  if (existing.status === "cancelled") {
    await cancelBookingRow(supabase, existing);
    return null;
  }
  return existing;
}

function parseEtd(raw: unknown): string | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// ---------- returns ----------

interface ReturnContext {
  rr: any;
  order: any;
  lines: any[]; // order_items of the return's items
}

async function loadReturn(supabase: Db, returnRequestId: string): Promise<ReturnContext> {
  const { data: rr, error } = await supabase
    .from("return_requests")
    .select("*")
    .eq("id", returnRequestId)
    .maybeSingle();
  if (error) throw error;
  if (!rr) throw new ActionError("Return request not found", 404);
  if (rr.return_destination !== "warehouse") throw new ActionError("This return goes straight to the boutique");
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, user_id, payment_method, payment_status, warehouse_id")
    .eq("id", rr.order_id)
    .single();
  if (orderErr) throw orderErr;
  const itemIds = ((rr.items ?? []) as any[]).map((i) => i.order_item_id).filter(Boolean);
  const { data: lines } = await supabase
    .from("order_items")
    .select("id, product_id, vendor_id, vendor_order_id, sku, price")
    .in("id", itemIds);
  return { rr, order, lines: lines ?? [] };
}

// One send-back per boutique for a return's items.
async function createReturnSendBacks(supabase: Db, ctx: ReturnContext, reason: string, notes: string | null) {
  const lineById = new Map(ctx.lines.map((l) => [l.id, l]));
  const byVendor = new Map<string, { vendorOrderId: string | null; items: any[] }>();
  for (const item of (ctx.rr.items ?? []) as any[]) {
    const line = lineById.get(item.order_item_id);
    if (!line?.vendor_id) continue;
    const group = byVendor.get(line.vendor_id) ?? { vendorOrderId: line.vendor_order_id, items: [] as any[] };
    const size = reason === "replacement_qc_failed" || reason === "replacement_unused" ? item.exchange_to?.size ?? item.size : item.size;
    const color = reason === "replacement_qc_failed" || reason === "replacement_unused" ? item.exchange_to?.color ?? item.color : item.color;
    group.items.push({
      order_item_id: item.order_item_id,
      product_id: line.product_id,
      product_title: item.product_title,
      quantity: item.quantity,
      size: size ?? null,
      color: color ?? null,
      sku: line.sku,
      price: Number(item.price ?? line.price ?? 0),
    });
    byVendor.set(line.vendor_id, group);
  }
  const ref = `#${String(ctx.rr.order_id).slice(0, 8)}`;
  for (const [vendorId, group] of byVendor) {
    const { error } = await supabase.from("boutique_send_backs").insert({
      warehouse_id: ctx.order.warehouse_id,
      vendor_id: vendorId,
      order_id: ctx.rr.order_id,
      vendor_order_id: group.vendorOrderId,
      return_request_id: ctx.rr.id,
      reason,
      items: group.items,
      notes,
    });
    if (error) throw error;
    await notifyVendorMembers(supabase, vendorId, {
      type: "warehouse_send_back",
      title: "Items coming back to you",
      body: `Items from ${ctx.rr.request_type === "exchange" ? "an exchange" : "a return"} on order ${ref} are being sent to you from the AllBoutiqs warehouse (${reason.replace(/_/g, " ")}).`,
      link: links.vendorReturn(ctx.rr.id),
    });
  }
}

async function createReturnDispatch(supabase: Db, ctx: ReturnContext, purpose: "exchange_replacement" | "return_send_back", userId: string) {
  const { data: existing } = await supabase
    .from("warehouse_dispatches")
    .select("id")
    .eq("return_request_id", ctx.rr.id)
    .eq("purpose", purpose)
    .neq("status", "cancelled")
    .maybeSingle();
  if (existing) return existing.id;
  const lineById = new Map(ctx.lines.map((l) => [l.id, l]));
  const weightKg = await computeTotalWeightKg(
    supabase,
    ((ctx.rr.items ?? []) as any[])
      .filter((i) => lineById.has(i.order_item_id))
      .map((i) => ({ product_id: lineById.get(i.order_item_id).product_id, quantity: i.quantity })),
  );
  const { data, error } = await supabase
    .from("warehouse_dispatches")
    .insert({
      order_id: ctx.rr.order_id,
      warehouse_id: ctx.order.warehouse_id,
      purpose,
      return_request_id: ctx.rr.id,
      weight_kg: weightKg,
      length_cm: PARCEL_DEFAULTS.lengthCm,
      breadth_cm: PARCEL_DEFAULTS.breadthCm,
      height_cm: PARCEL_DEFAULTS.heightCm,
      packed_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// The refund for a return that passed inspection, split per boutique so each
// boutique's payout share is reversed for its own items.
async function refundReturn(supabase: Db, ctx: ReturnContext, amount: number, userId: string, notes: string | null) {
  const lineById = new Map(ctx.lines.map((l) => [l.id, l]));
  const valueByVendorOrder = new Map<string, number>();
  for (const item of (ctx.rr.items ?? []) as any[]) {
    const line = lineById.get(item.order_item_id);
    const key = line?.vendor_order_id ?? "";
    valueByVendorOrder.set(key, (valueByVendorOrder.get(key) ?? 0) + Number(item.price ?? line?.price ?? 0) * Number(item.quantity ?? 1));
  }
  const totalValue = [...valueByVendorOrder.values()].reduce((a, b) => a + b, 0);
  const groups = [...valueByVendorOrder.entries()];
  let remaining = round2(amount);
  for (let i = 0; i < groups.length; i++) {
    const [vendorOrderId, value] = groups[i];
    const share = i === groups.length - 1 ? remaining : round2(totalValue > 0 ? (amount * value) / totalValue : amount / groups.length);
    remaining = round2(remaining - share);
    if (share <= 0) continue;
    await executeRefund(supabase, {
      orderId: ctx.rr.order_id,
      amount: share,
      reason: `Return passed inspection${notes ? `: ${notes}` : ""}`,
      initiatedBy: userId,
      returnRequestId: ctx.rr.id,
      vendorOrderId: vendorOrderId || null,
    });
  }
}

function returnEmail(supabase: Db, returnRequestId: string, newStatus: string, extra: Record<string, unknown> = {}) {
  supabase.functions
    .invoke("send-return-status-email", { body: { returnRequestId, newStatus, ...extra } })
    .catch((e: unknown) => console.error("warehouse-actions: return email failed", e));
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action: string = body.action;

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    if (!(await canOperate(supabase, userId))) return jsonResponse({ error: "Forbidden" }, 403);
    const admin = await isAdmin(supabase, userId);
    const requireAdmin = () => {
      if (!admin) throw new ActionError("Only an admin can decide this", 403);
    };

    switch (action) {
      case "parcel_rates": {
        const plan = body.dispatch_id
          ? (await loadDispatchPlan(supabase, body.dispatch_id)).plan
          : body.send_back_id
            ? (await loadSendBackPlan(supabase, body.send_back_id)).plan
            : null;
        if (!plan) throw new ActionError("dispatch_id or send_back_id is required");
        const couriers = await ratesFor(supabase, plan);
        if (couriers.length === 0) {
          throw new ActionError(`No courier currently services ${plan.warehouse.address.pincode} -> ${plan.consignee.address.pincode}`);
        }
        return jsonResponse({ couriers, isCod: plan.cod, weightKg: plan.weightKg });
      }

      case "book_dispatch": {
        const { dispatch, plan, leadVendorOrderId } = await loadDispatchPlan(supabase, body.dispatch_id);
        if (dispatch.status !== "packing") throw new ActionError(`This parcel is already ${dispatch.status}`);
        const existing = await liveBooking(supabase, "dispatch_id", dispatch.id);
        if (existing?.awb_code) return jsonResponse({ shipment: existing, already_booked: true });

        const etd = parseEtd(body.courier_etd);
        const shipment = await bookFromWarehouse(supabase, plan, dispatch.id, body.courier_id ?? null, {
          shipment_type: "warehouse_to_customer",
          order_id: dispatch.order_id,
          dispatch_id: dispatch.id,
          vendor_order_id: leadVendorOrderId,
          estimated_delivery_date: etd,
        });
        await supabase.from("warehouse_dispatches").update({ status: "booked" }).eq("id", dispatch.id);
        if (dispatch.purpose === "order" && etd) {
          await supabase.from("orders").update({ estimated_delivery_date: etd }).eq("id", dispatch.order_id);
        }
        return jsonResponse({ shipment, already_booked: false });
      }

      case "cancel_dispatch_booking": {
        const { data: shipment } = await supabase
          .from("shipments")
          .select("id, awb_code, shiprocket_order_id, status")
          .eq("dispatch_id", body.dispatch_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!shipment) throw new ActionError("No booking found for this parcel");
        if (!(await cancelBookingRow(supabase, shipment))) {
          throw new ActionError("The courier has already picked this parcel up - it can't be cancelled now");
        }
        await supabase.from("warehouse_dispatches").update({ status: "packing" }).eq("id", body.dispatch_id);
        return jsonResponse({ cancelled: true });
      }

      case "book_send_back": {
        const { sendBack, plan } = await loadSendBackPlan(supabase, body.send_back_id);
        if (sendBack.status !== "required") throw new ActionError(`This send-back is already ${sendBack.status}`);
        const existing = await liveBooking(supabase, "send_back_id", sendBack.id);
        if (existing?.awb_code) return jsonResponse({ shipment: existing, already_booked: true });
        const shipment = await bookFromWarehouse(supabase, plan, sendBack.id, body.courier_id ?? null, {
          shipment_type: "warehouse_to_boutique",
          order_id: sendBack.order_id,
          vendor_order_id: sendBack.vendor_order_id,
          send_back_id: sendBack.id,
          estimated_delivery_date: parseEtd(body.courier_etd),
        });
        await supabase.from("boutique_send_backs").update({ status: "booked" }).eq("id", sendBack.id);
        return jsonResponse({ shipment, already_booked: false });
      }

      case "cancel_send_back_booking": {
        const { data: shipment } = await supabase
          .from("shipments")
          .select("id, awb_code, shiprocket_order_id, status")
          .eq("send_back_id", body.send_back_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!shipment) throw new ActionError("No booking found");
        if (!(await cancelBookingRow(supabase, shipment))) {
          throw new ActionError("The courier has already picked this parcel up - it can't be cancelled now");
        }
        await supabase.from("boutique_send_backs").update({ status: "required" }).eq("id", body.send_back_id);
        return jsonResponse({ cancelled: true });
      }

      case "return_qc": {
        const ctx = await loadReturn(supabase, body.return_request_id);
        const notes = String(body.notes ?? "").trim() || null;
        if (ctx.rr.status !== "at_warehouse" || !ctx.rr.received_at_warehouse_at) {
          throw new ActionError("Receive this return before inspecting it");
        }
        const stamp = { warehouse_qc_notes: notes, warehouse_qc_at: new Date().toISOString(), warehouse_qc_by: userId };

        if (!body.passed) {
          if (!notes) throw new ActionError("Describe what is wrong with the items");
          await supabase.from("return_requests").update({ ...stamp, warehouse_qc_status: "failed", status: "qc_failed" }).eq("id", ctx.rr.id);
          const dispatchId = await createReturnDispatch(supabase, ctx, "return_send_back", userId);
          // An exchange replacement already here is no longer needed.
          if (ctx.rr.request_type === "exchange" && ctx.rr.replacement_received_at) {
            await createReturnSendBacks(supabase, ctx, "replacement_unused", "The old item failed inspection");
          }
          returnEmail(supabase, ctx.rr.id, "qc_failed", { adminNotes: notes });
          return jsonResponse({ passed: false, send_back_dispatch_id: dispatchId });
        }

        if (ctx.rr.request_type === "exchange") {
          await supabase.from("return_requests").update({ ...stamp, warehouse_qc_status: "passed", status: "qc_passed" }).eq("id", ctx.rr.id);
          await createReturnSendBacks(supabase, ctx, "exchange_forward", notes);
          let dispatchId: string | null = null;
          if (ctx.rr.replacement_qc_status === "passed") {
            dispatchId = await createReturnDispatch(supabase, { ...ctx, rr: { ...ctx.rr } }, "exchange_replacement", userId);
          }
          returnEmail(supabase, ctx.rr.id, "qc_passed");
          return jsonResponse({ passed: true, replacement_dispatch_id: dispatchId });
        }

        // A return: refund now, then the items go on to the boutique(s).
        const itemsValue = ((ctx.rr.items ?? []) as any[]).reduce((s, i) => s + Number(i.price ?? 0) * Number(i.quantity ?? 1), 0);
        const amount = round2(Number(ctx.rr.refund_amount) > 0 ? Number(ctx.rr.refund_amount) : itemsValue);
        let refundError: string | null = null;
        if (ctx.order.payment_method === "razorpay" && amount > 0) {
          try {
            await refundReturn(supabase, ctx, amount, userId, notes);
          } catch (e) {
            refundError = e instanceof RefundValidationError ? e.message : errorMessage(e);
            console.error("warehouse-actions: return refund failed", refundError);
          }
        }
        const refunded = ctx.order.payment_method === "razorpay" && !refundError;
        await supabase
          .from("return_requests")
          .update({ ...stamp, warehouse_qc_status: "passed", refund_amount: amount, status: refunded || amount <= 0 ? "completed" : "qc_passed" })
          .eq("id", ctx.rr.id);
        await createReturnSendBacks(supabase, ctx, "return_forward", notes);

        const ref = `#${String(ctx.rr.order_id).slice(0, 8)}`;
        if (refunded || amount <= 0) {
          returnEmail(supabase, ctx.rr.id, "completed", { refundAmount: amount });
        } else {
          returnEmail(supabase, ctx.rr.id, "qc_passed");
          await notifyAllAdmins(supabase, {
            type: "warehouse_refund_needed",
            title: refundError ? "Return refund failed" : "Refund this return by hand",
            body: refundError
              ? `The return on order ${ref} passed inspection but the ₹${amount} refund failed: ${refundError}. Retry from Returns (Mark Completed).`
              : `The return on order ${ref} passed inspection. It was paid by Cash on Delivery - refund ₹${amount} to the customer by bank transfer, then mark the return completed.`,
            link: links.adminReturn(ctx.rr.id),
            category: "order",
          });
        }
        return jsonResponse({ passed: true, refunded, refund_error: refundError, amount });
      }

      case "replacement_qc": {
        const ctx = await loadReturn(supabase, body.return_request_id);
        const notes = String(body.notes ?? "").trim() || null;
        if (ctx.rr.request_type !== "exchange") throw new ActionError("This is not an exchange");
        if (!ctx.rr.replacement_received_at) throw new ActionError("Receive the replacement before inspecting it");
        if (body.passed) {
          await supabase.from("return_requests").update({ replacement_qc_status: "passed", replacement_qc_notes: notes }).eq("id", ctx.rr.id);
          let dispatchId: string | null = null;
          if (ctx.rr.warehouse_qc_status === "passed") {
            dispatchId = await createReturnDispatch(supabase, ctx, "exchange_replacement", userId);
          }
          return jsonResponse({ passed: true, replacement_dispatch_id: dispatchId });
        }
        if (!notes) throw new ActionError("Describe what is wrong with the replacement");
        // Back to the boutique; they send another one.
        await createReturnSendBacks(supabase, ctx, "replacement_qc_failed", notes);
        await supabase
          .from("return_requests")
          .update({ replacement_qc_status: null, replacement_qc_notes: notes, replacement_received_at: null })
          .eq("id", ctx.rr.id);
        const vendorIds = [...new Set(ctx.lines.map((l) => l.vendor_id).filter(Boolean))];
        for (const vendorId of vendorIds) {
          await notifyVendorMembers(supabase, vendorId, {
            type: "exchange_replacement_failed",
            title: "Replacement failed inspection",
            body: `The replacement you sent for the exchange on order #${String(ctx.rr.order_id).slice(0, 8)} failed our quality check: ${notes}. It's coming back to you - please send another.`,
            link: links.vendorReturn(ctx.rr.id),
          });
        }
        return jsonResponse({ passed: false });
      }

      case "resolve_qc_failure": {
        requireAdmin();
        const { data: vo } = await supabase
          .from("vendor_orders")
          .select("id, order_id, vendor_id, status, subtotal, shipping_cost, qc_notes")
          .eq("id", body.vendor_order_id)
          .maybeSingle();
        if (!vo) throw new ActionError("Order not found", 404);
        if (vo.status !== "qc_failed") throw new ActionError("This item isn't waiting on an inspection decision");
        const ref = `#${String(vo.order_id).slice(0, 8)}`;

        if (body.decision === "replacement") {
          const settings = await loadWarehouseSettings(supabase);
          const holidays = await loadHolidays(supabase);
          const { data: vendor } = await supabase.from("vendors").select("default_prep_days").eq("id", vo.vendor_id).maybeSingle();
          const readyBy = addWorkingDays(istToday(), vendor?.default_prep_days ?? settings.defaultPrepDays, holidays);
          const expected = new Date(`${readyBy}T00:00:00Z`);
          expected.setUTCDate(expected.getUTCDate() + settings.inboundTransitDays);
          await supabase.rpc("create_boutique_send_back", {
            _vendor_order_id: vo.id,
            _reason: "qc_failed_replacement",
            _notes: vo.qc_notes,
          });
          await supabase
            .from("vendor_orders")
            .update({
              status: "confirmed",
              qc_status: null,
              arrived_at_warehouse_at: null,
              received_at_warehouse_at: null,
              received_by: null,
              warehouse_shelf: null,
              ready_by: readyBy,
              expected_at_warehouse_on: expected.toISOString().slice(0, 10),
              late_reminder_sent_at: null,
              overdue_alerted_at: null,
            })
            .eq("id", vo.id);
          await notifyVendorMembers(supabase, vo.vendor_id, {
            type: "warehouse_send_replacement",
            title: "Please send a replacement",
            body: `The item you sent for order ${ref} failed inspection (${vo.qc_notes ?? "see notes"}). It's coming back to you - please send a replacement to the warehouse with Ship Now.`,
            link: links.vendorOrder(vo.id),
          });
          return jsonResponse({ decision: "replacement" });
        }

        // Default: cancel and refund this part; the rest of the order ships.
        const { data: order } = await supabase
          .from("orders")
          .select("id, payment_method, payment_status")
          .eq("id", vo.order_id)
          .single();
        const result = await cancelOneVendorOrder(supabase, {
          vendorOrder: vo,
          order: order!,
          cancelledBy: userId,
          reason: `Failed quality inspection: ${vo.qc_notes ?? "item not acceptable"}`,
          force: true,
        });
        await supabase.rpc("create_boutique_send_back", { _vendor_order_id: vo.id, _reason: "qc_failed", _notes: vo.qc_notes });
        await finishCancellation(supabase, vo.order_id, [result], "It didn't pass our quality check, so we didn't send it to you.");
        return jsonResponse({ decision: "cancel", refund_error: result.refundError });
      }

      case "rto_cancel": {
        requireAdmin();
        const { data: dispatch } = await supabase
          .from("warehouse_dispatches")
          .select("id, order_id, status, rto_received_at")
          .eq("id", body.dispatch_id)
          .maybeSingle();
        if (!dispatch) throw new ActionError("Parcel not found", 404);
        if (dispatch.status !== "rto" || !dispatch.rto_received_at) {
          throw new ActionError("The parcel must be back at the warehouse first");
        }
        const { data: order } = await supabase
          .from("orders")
          .select("id, payment_method, payment_status")
          .eq("id", dispatch.order_id)
          .single();
        const { data: vendorOrders } = await supabase
          .from("vendor_orders")
          .select("id, order_id, status, subtotal, shipping_cost")
          .eq("dispatch_id", dispatch.id)
          .neq("status", "cancelled");
        const reason = String(body.reason ?? "").trim() || "Could not be delivered";
        const results = [];
        for (const vo of vendorOrders ?? []) {
          const result = await cancelOneVendorOrder(supabase, { vendorOrder: vo, order: order!, cancelledBy: userId, reason, force: true });
          await supabase.rpc("create_boutique_send_back", { _vendor_order_id: vo.id, _reason: "rto_cancelled", _notes: reason });
          results.push(result);
        }
        await finishCancellation(supabase, dispatch.order_id, results, "The courier couldn't deliver it.");
        return jsonResponse({ cancelled: results.length });
      }

      default:
        throw new ActionError(`Unknown action ${action}`);
    }
  } catch (e) {
    console.error("warehouse-actions error", e);
    return jsonResponse({ error: errorMessage(e) }, e instanceof ActionError ? e.status : 500);
  }
});

// Same follow-up cancel-order-items does: order-level status, customer
// email, boutique/admin notice.
async function finishCancellation(
  supabase: Db,
  orderId: string,
  results: { cancelled: boolean; cancellationId: string | null; vendorOrderId: string; refundError: string | null }[],
  cancelReason: string,
) {
  const { data: all } = await supabase.from("vendor_orders").select("status").eq("order_id", orderId);
  if ((all ?? []).every((vo) => vo.status === "cancelled")) {
    await supabase.from("orders").update({ order_status: "cancelled" }).eq("id", orderId);
  }
  for (const r of results) {
    if (!r.cancelled || !r.cancellationId) continue;
    supabase.functions
      .invoke("send-order-email", { body: { orderId, type: "cancelled", vendorOrderId: r.vendorOrderId, cancelReason } })
      .catch((e: unknown) => console.error("warehouse-actions: customer email failed", e));
    supabase.functions
      .invoke("send-order-cancellation-notice", {
        body: { order_cancellation_id: r.cancellationId, refund_error: r.refundError },
      })
      .catch((e: unknown) => console.error("warehouse-actions: cancellation notice failed", e));
  }
}
