import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  isVendorMember,
  ensurePickupLocation,
  shiprocketRequest,
  errorMessage,
  computeTotalWeightKg,
  bookForwardShipment,
  bookedCourierCost,
  cancelOrphanedShiprocketOrder,
  Consignee,
} from "../_shared/shiprocket.ts";
import { getWarehouse, PARCEL_DEFAULTS, toShiprocketItems, warehouseConsignee } from "../_shared/warehouse.ts";

// The "Ship Now" action: the boutique has packed the order, this call
// creates the real Shiprocket order, assigns a courier, and books the
// pickup, all in one call via their Forward wrapper API. Everything after
// this point (in transit, delivered, NDR, RTO) is driven automatically by
// the courier-tracking-webhook function - no further manual status updates.
//
// Warehouse route: the parcel goes to the AllBoutiqs warehouse, not the
// customer, and is always prepaid (Cash on Delivery is collected on the
// warehouse's own parcel to the customer). With return_request_id it books an
// exchange's replacement to the warehouse instead.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vendor_order_id, courier_id, courier_etd, return_request_id } = await req.json();
    if (!vendor_order_id) return jsonResponse({ error: "vendor_order_id is required" }, 400);

    // courier_etd is the exact date already shown to the vendor for this
    // courier before booking (checkCourierServiceability) - persisted here
    // since it's the only place it can live once a shipment exists.
    // Validated the same way DeliveryEstimate.tsx already proves a real
    // etd behaves (a valid Date, not a relative string like "3 days") -
    // never blocks booking on a missing/malformed value.
    const parsedEtd = courier_etd ? new Date(courier_etd) : null;
    const estimatedDeliveryDate =
      parsedEtd && !isNaN(parsedEtd.getTime()) ? parsedEtd.toISOString().slice(0, 10) : null;

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();

    const { data: vendorOrder, error: voErr } = await supabase
      .from("vendor_orders")
      .select("id, order_id, vendor_id, status, subtotal, shipping_cost")
      .eq("id", vendor_order_id)
      .maybeSingle();
    if (voErr) throw voErr;
    if (!vendorOrder) return jsonResponse({ error: "Vendor order not found" }, 404);

    const authorized =
      (await isAdmin(supabase, userId)) || (await isVendorMember(supabase, userId, vendorOrder.vendor_id));
    if (!authorized) return jsonResponse({ error: "Forbidden" }, 403);

    const [{ data: order, error: orderErr }, { data: vendor, error: vendorErr }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, customer_name, customer_email, customer_phone, shipping_address, payment_method, created_at, fulfilment_route, warehouse_id")
        .eq("id", vendorOrder.order_id)
        .single(),
      supabase
        .from("vendors")
        .select("id, slug, name, contact_email, contact_phone, address, shiprocket_pickup_location, shiprocket_pickup_id")
        .eq("id", vendorOrder.vendor_id)
        .single(),
    ]);
    if (orderErr) throw orderErr;
    if (vendorErr) throw vendorErr;

    const viaWarehouse = order.fulfilment_route === "warehouse" && !!order.warehouse_id;
    const isReplacement = !!return_request_id;
    const legType = viaWarehouse ? "to_warehouse" : "forward";

    let returnRequest: any = null;
    if (isReplacement) {
      if (!viaWarehouse) {
        return jsonResponse({ error: "Replacements are only sent through the warehouse on warehouse orders" }, 400);
      }
      const { data: rr } = await supabase
        .from("return_requests")
        .select("id, order_id, request_type, status, return_destination, items, replacement_received_at")
        .eq("id", return_request_id)
        .maybeSingle();
      if (!rr || rr.order_id !== order.id || rr.request_type !== "exchange" || rr.return_destination !== "warehouse") {
        return jsonResponse({ error: "No warehouse exchange found for this order" }, 400);
      }
      if (["pending", "rejected", "cancelled", "completed", "replacement_shipped", "qc_failed"].includes(rr.status)) {
        return jsonResponse({ error: `This exchange is ${rr.status.replace(/_/g, " ")}` }, 400);
      }
      if (rr.replacement_received_at) {
        return jsonResponse({ error: "The replacement has already reached the warehouse" }, 400);
      }
      returnRequest = rr;
    } else {
      if (["cancelled", "returned"].includes(vendorOrder.status)) {
        return jsonResponse({ error: `Cannot ship a ${vendorOrder.status} order` }, 400);
      }
      if (viaWarehouse && !["pending", "confirmed", "processing"].includes(vendorOrder.status)) {
        return jsonResponse({ error: "This order has already reached the warehouse" }, 400);
      }
    }

    let existingQuery = supabase
      .from("shipments")
      .select("id, awb_code, courier_name, label_url, manifest_url, status, shiprocket_order_id")
      .eq("vendor_order_id", vendor_order_id)
      .eq("shipment_type", legType);
    existingQuery = isReplacement ? existingQuery.eq("return_request_id", return_request_id) : existingQuery.is("return_request_id", null);
    const { data: existingShipment } = await existingQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (existingShipment?.status === "cancelled") {
      // Courier-side cancellation (the webhook marks it, e.g. Shiprocket
      // auto-cancelling after failed pickups) - the old booking is dead, so
      // clear it the same way a manual cancel does (deleteOnCancel) instead
      // of treating its leftover AWB as "already shipped" and blocking rebook.
      // Shiprocket's auto-cancel leaves its order sitting in NEW, so cancel
      // that too or the panel ends up with a stale duplicate next to the
      // fresh booking below. Best-effort: it may already be cancelled there.
      if (existingShipment.shiprocket_order_id) {
        try {
          await shiprocketRequest(supabase, "/orders/cancel", {
            method: "POST",
            body: { ids: [existingShipment.shiprocket_order_id] },
          });
        } catch (e) {
          console.error("shiprocket-create-shipment: could not cancel stale Shiprocket order", e);
        }
      }
      await supabase.from("shipments").delete().eq("id", existingShipment.id);
    } else if (existingShipment?.awb_code) {
      // On the warehouse route a parcel that already reached the warehouse
      // may be followed by another one because the first failed inspection:
      // the order is back at "confirmed" waiting for it, or (exchange) the
      // replacement was rejected, so it isn't marked received any more.
      const replacingFailedItem =
        viaWarehouse &&
        existingShipment.status === "delivered" &&
        (isReplacement || vendorOrder.status === "confirmed");
      if (!replacingFailedItem) {
        return jsonResponse({ shipment: existingShipment, already_shipped: true });
      }
    }

    // What goes in the parcel: the boutique's order lines, or the exchange's
    // replacement items (same product, the size/colour the customer asked for).
    let lines: { product_id: string; quantity: number; name: string; sku: string; price: number }[];
    if (isReplacement) {
      const rrItems = (returnRequest.items ?? []) as any[];
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("id, product_id, variant_id, product_title, variant_title, sku, quantity, price, vendor_order_id")
        .in("id", rrItems.map((i) => i.order_item_id).filter(Boolean));
      const mine = (orderItems ?? []).filter((oi) => oi.vendor_order_id === vendor_order_id);
      if (mine.length === 0) return jsonResponse({ error: "None of this exchange's items are from this boutique" }, 400);
      const shiprocketItems = await toShiprocketItems(supabase, mine.map((oi) => ({ ...oi, order_item_id: oi.id })));
      lines = mine.map((oi, idx) => {
        const target = rrItems.find((i) => i.order_item_id === oi.id)?.exchange_to;
        const wanted = [target?.size, target?.color].filter(Boolean).join(" / ");
        const qty = rrItems.find((i) => i.order_item_id === oi.id)?.quantity ?? oi.quantity;
        return {
          product_id: oi.product_id,
          quantity: qty,
          name: `${oi.product_title} - replacement${wanted ? ` (${wanted})` : ""}`,
          sku: shiprocketItems[idx].sku,
          price: Number(oi.price ?? 0),
        };
      });
    } else {
      const { data: items, error: itemsErr } = await supabase
        .from("order_items")
        .select("id, product_id, variant_id, product_title, variant_title, sku, quantity, price")
        .eq("vendor_order_id", vendor_order_id);
      if (itemsErr) throw itemsErr;
      if (!items || items.length === 0) return jsonResponse({ error: "No items on this vendor order" }, 400);
      const shiprocketItems = await toShiprocketItems(supabase, items.map((i) => ({ ...i, order_item_id: i.id })));
      lines = items.map((i, idx) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        name: shiprocketItems[idx].name,
        sku: shiprocketItems[idx].sku,
        price: Number(i.price ?? 0),
      }));
    }

    const weightKg = await computeTotalWeightKg(supabase, lines);
    const pickupLocation = await ensurePickupLocation(supabase, vendor as any);
    const warehouse = viaWarehouse ? await getWarehouse(supabase, order.warehouse_id) : null;

    const consignee: Consignee = warehouse
      ? warehouseConsignee(warehouse)
      : {
          name: order.customer_name,
          email: order.customer_email,
          phone: order.customer_phone,
          address: order.shipping_address as any,
        };
    const isCod = !warehouse && order.payment_method === "cod";
    const subTotal = isReplacement
      ? lines.reduce((sum, l) => sum + l.price * l.quantity, 0)
      : Number(vendorOrder.subtotal);

    // Shiprocket treats this as an idempotency key on their side, not just
    // our own reference - confirmed live: reusing the bare vendor_order_id
    // on a retry after a cancellation returned the SAME stale cancelled
    // order (still bound to whatever pickup location it originally had)
    // instead of creating a genuinely fresh one, silently defeating a
    // pickup-address fix that should have applied. Unique per attempt.
    const channelOrderId = isReplacement
      ? `${return_request_id}-RP-${Date.now()}`
      : `${vendorOrder.id}-${Date.now()}`;

    const booking = await bookForwardShipment(supabase, {
      channelOrderId,
      orderDate: order.created_at,
      pickupLocationName: pickupLocation.name,
      consignee,
      items: lines.map((l) => ({ name: l.name, sku: l.sku, units: l.quantity, selling_price: l.price })),
      cod: isCod,
      subTotal,
      // On the warehouse route the customer's delivery charge belongs to the
      // warehouse's own parcel, not this leg.
      shippingCharges: warehouse || isReplacement ? 0 : Number(vendorOrder.shipping_cost),
      totalDiscount: 0,
      weightKg,
      lengthCm: PARCEL_DEFAULTS.lengthCm,
      breadthCm: PARCEL_DEFAULTS.breadthCm,
      heightCm: PARCEL_DEFAULTS.heightCm,
      courierId: courier_id ?? null,
    });

    const courierCost = await bookedCourierCost(supabase, {
      pickupPincode: (vendor.address as any)?.pincode,
      deliveryPincode: consignee.address.pincode ?? "",
      cod: isCod,
      weightKg,
      courierId: booking.courierId,
    });

    const { data: shipment, error: insertErr } = await supabase
      .from("shipments")
      .insert({
        vendor_order_id,
        order_id: order.id,
        warehouse_id: warehouse?.id ?? null,
        return_request_id: isReplacement ? return_request_id : null,
        shipment_type: legType,
        shiprocket_channel_order_id: channelOrderId,
        shiprocket_order_id: booking.orderId,
        shiprocket_shipment_id: booking.shipmentId,
        awb_code: booking.awbCode,
        courier_id: booking.courierId,
        courier_name: booking.courierName,
        status: booking.awbCode ? "awb_assigned" : "pending",
        label_url: booking.labelUrl,
        manifest_url: booking.manifestUrl,
        estimated_delivery_date: estimatedDeliveryDate,
        courier_cost: courierCost,
      })
      .select()
      .single();
    if (insertErr) {
      // The Shiprocket order genuinely exists at this point even though
      // we failed to record it - confirmed live (a DB-side failure here
      // left a real orphaned "NEW" order in Shiprocket with no local
      // record, which would have caused a duplicate booking on retry).
      // No AWB has been assigned yet, so cancelling it back out is safe.
      await cancelOrphanedShiprocketOrder(supabase, booking.orderId);
      throw insertErr;
    }

    if (!warehouse) {
      await supabase.from("vendor_orders").update({ status: "confirmed" }).eq("id", vendor_order_id);
    } else if (!isReplacement) {
      await supabase
        .from("vendor_orders")
        .update({
          status: "confirmed",
          // The courier's own date replaces the planning estimate the
          // warehouse's 3-day wait counts from.
          ...(estimatedDeliveryDate ? { expected_at_warehouse_on: estimatedDeliveryDate } : {}),
        })
        .eq("id", vendor_order_id)
        .in("status", ["pending", "confirmed"]);
    }

    return jsonResponse({ shipment, already_shipped: false, via_warehouse: !!warehouse });
  } catch (e) {
    console.error("shiprocket-create-shipment error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
