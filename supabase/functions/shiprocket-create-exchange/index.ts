import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  ensurePickupLocation,
  shiprocketRequest,
  errorMessage,
  toIntOrNull,
} from "../_shared/shiprocket.ts";

const DEFAULT_ITEM_WEIGHT_GRAMS = 300;
const DEFAULT_LENGTH_CM = 25;
const DEFAULT_BREADTH_CM = 20;
const DEFAULT_HEIGHT_CM = 5;

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

async function tryAssignAwbAndPickup(
  supabase: ReturnType<typeof serviceClient>,
  shipmentRowId: string,
  shiprocketShipmentId: number,
) {
  try {
    const awbResult = await shiprocketRequest(supabase, "/courier/assign/awb", {
      method: "POST",
      body: { shipment_id: shiprocketShipmentId },
    });
    const awbData = awbResult?.response?.data;
    if (awbData?.awb_code) {
      await supabase
        .from("shipments")
        .update({
          awb_code: awbData.awb_code,
          courier_id: toIntOrNull(awbData.courier_company_id),
          courier_name: awbData.courier_name ?? null,
          status: "awb_assigned",
        })
        .eq("id", shipmentRowId);

      await shiprocketRequest(supabase, "/courier/generate/pickup", {
        method: "POST",
        body: { shipment_id: [shiprocketShipmentId] },
      });
      await supabase.from("shipments").update({ status: "pickup_scheduled" }).eq("id", shipmentRowId);
    }
  } catch (e) {
    console.error("shiprocket-create-exchange: AWB/pickup follow-up failed for shipment", shipmentRowId, e);
  }
}

// Admin-triggered when approving an exchange request. Shiprocket's
// exchange API creates TWO linked shipments in one call: a return leg
// (old item, customer -> vendor) and a forward leg (new item,
// vendor -> customer) - both stored here, tracked independently from
// then on via the webhook.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { return_request_id } = await req.json();
    if (!return_request_id) return jsonResponse({ error: "return_request_id is required" }, 400);

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    if (!(await isAdmin(supabase, userId))) return jsonResponse({ error: "Forbidden" }, 403);

    const { data: returnRequest, error: rrErr } = await supabase
      .from("return_requests")
      .select("id, order_id, request_type, items, exchange_details, created_at")
      .eq("id", return_request_id)
      .maybeSingle();
    if (rrErr) throw rrErr;
    if (!returnRequest) return jsonResponse({ error: "Return request not found" }, 404);
    if (returnRequest.request_type !== "exchange") {
      return jsonResponse({ error: "This is a return request - use shiprocket-create-return instead" }, 400);
    }

    const { data: existingShipments } = await supabase
      .from("shipments")
      .select("id, shipment_type, awb_code")
      .eq("return_request_id", return_request_id);
    if (existingShipments && existingShipments.length > 0) {
      return jsonResponse({ shipments: existingShipments, already_scheduled: true });
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, customer_name, customer_email, customer_phone, shipping_address, payment_method")
      .eq("id", returnRequest.order_id)
      .single();
    if (orderErr) throw orderErr;

    const items = returnRequest.items as any[];
    const orderItemIds = items.map((i) => i.order_item_id).filter(Boolean);
    const { data: orderItems, error: oiErr } = await supabase
      .from("order_items")
      .select("id, vendor_id, vendor_order_id, sku")
      .in("id", orderItemIds);
    if (oiErr) throw oiErr;

    const vendorIds = [...new Set((orderItems ?? []).map((i) => i.vendor_id).filter(Boolean))];
    if (vendorIds.length === 0) return jsonResponse({ error: "Could not resolve a vendor for this exchange" }, 400);
    if (vendorIds.length > 1) {
      return jsonResponse({ error: "This exchange spans multiple vendors - not supported in one request" }, 400);
    }
    const vendorOrderId = orderItems![0].vendor_order_id;

    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .select("id, slug, name, contact_email, contact_phone, address, shiprocket_pickup_location, shiprocket_pickup_id")
      .eq("id", vendorIds[0])
      .single();
    if (vendorErr) throw vendorErr;

    const pickupLocation = await ensurePickupLocation(supabase, vendor as any);
    if (pickupLocation.id == null) {
      return jsonResponse({ error: "Vendor's Shiprocket pickup location has no numeric id on file - re-register the pickup location" }, 400);
    }

    const customerAddress = order.shipping_address as Record<string, string>;
    const exchangeDetails = (returnRequest.exchange_details ?? {}) as Record<string, string>;
    const skuByOrderItemId = new Map((orderItems ?? []).map((i) => [i.id, i.sku]));
    const subTotal = items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);
    const totalWeightGrams = items.reduce((sum, i) => sum + DEFAULT_ITEM_WEIGHT_GRAMS * i.quantity, 0);
    const nameParts = order.customer_name.split(" ");
    const firstName = nameParts[0] || order.customer_name;
    const lastName = nameParts.slice(1).join(" ") || "";

    const createResult = await shiprocketRequest(supabase, "/orders/create/exchange", {
      method: "POST",
      body: {
        exchange_order_id: `${returnRequest.id}-EX`,
        return_order_id: `${returnRequest.id}-RT`,
        order_date: dateOnly(returnRequest.created_at),
        payment_method: order.payment_method === "cod" ? "cod" : "prepaid",
        seller_pickup_location_id: pickupLocation.id,
        seller_shipping_location_id: pickupLocation.id,
        // Same address for both legs in the common case: the item is
        // picked up from and the replacement shipped back to wherever
        // the original order was delivered.
        buyer_pickup_first_name: firstName,
        buyer_pickup_last_name: lastName,
        buyer_pickup_email: order.customer_email,
        buyer_pickup_address: customerAddress.address_line1,
        buyer_pickup_address_2: customerAddress.address_line2 || "",
        buyer_pickup_city: customerAddress.city,
        buyer_pickup_state: customerAddress.state,
        buyer_pickup_country: customerAddress.country || "India",
        buyer_pickup_pincode: customerAddress.pincode,
        buyer_pickup_phone: order.customer_phone,
        buyer_shipping_first_name: firstName,
        buyer_shipping_last_name: lastName,
        buyer_shipping_email: order.customer_email,
        buyer_shipping_address: customerAddress.address_line1,
        buyer_shipping_address_2: customerAddress.address_line2 || "",
        buyer_shipping_city: customerAddress.city,
        buyer_shipping_state: customerAddress.state,
        buyer_shipping_country: customerAddress.country || "India",
        buyer_shipping_pincode: customerAddress.pincode,
        buyer_shipping_phone: order.customer_phone,
        sub_total: subTotal,
        total_discount: "0",
        // return_reason is a Shiprocket-defined numeric code we don't
        // have the enumeration for yet - "1" is a placeholder; confirm
        // the real list once live credentials/testing are available.
        return_reason: "1",
        exchange_length: DEFAULT_LENGTH_CM,
        exchange_breadth: DEFAULT_BREADTH_CM,
        exchange_height: DEFAULT_HEIGHT_CM,
        exchange_weight: Math.max(totalWeightGrams / 1000, 0.1),
        return_length: DEFAULT_LENGTH_CM,
        return_breadth: DEFAULT_BREADTH_CM,
        return_height: DEFAULT_HEIGHT_CM,
        return_weight: Math.max(totalWeightGrams / 1000, 0.1),
        qc_check: "true",
        order_items: items.map((item) => ({
          name: item.product_title,
          sku: skuByOrderItemId.get(item.order_item_id) || item.order_item_id,
          units: item.quantity,
          selling_price: item.price ?? 0,
          discount: "",
          hsn: "",
          exchange_item_id: exchangeDetails.new_variant_id || item.order_item_id,
          exchange_item_name: item.product_title,
          exchange_item_sku: skuByOrderItemId.get(item.order_item_id) || item.order_item_id,
          qc_enable: true,
          qc_size: exchangeDetails.new_size || item.size || "",
          qc_color: exchangeDetails.new_color || item.color || "",
        })),
      },
    });

    if (createResult.success !== true) {
      throw new Error(createResult.message || "Shiprocket rejected the exchange request");
    }

    const fwd = createResult.data.forward_orders;
    const ret = createResult.data.return_orders;

    const { data: shipmentRows, error: insertErr } = await supabase
      .from("shipments")
      .insert([
        {
          vendor_order_id: vendorOrderId,
          return_request_id,
          shipment_type: "exchange_forward",
          shiprocket_order_id: toIntOrNull(fwd.order_id),
          shiprocket_shipment_id: toIntOrNull(fwd.shipment_id),
          status: "pending",
          status_raw: fwd.status ?? null,
        },
        {
          vendor_order_id: vendorOrderId,
          return_request_id,
          shipment_type: "exchange_return",
          shiprocket_order_id: toIntOrNull(ret.order_id),
          shiprocket_shipment_id: toIntOrNull(ret.shipment_id),
          status: "pending",
          status_raw: ret.status ?? null,
        },
      ])
      .select();
    if (insertErr) throw insertErr;

    const forwardRow = shipmentRows!.find((s) => s.shipment_type === "exchange_forward")!;
    const returnRow = shipmentRows!.find((s) => s.shipment_type === "exchange_return")!;

    // Best-effort - the exchange genuinely exists in Shiprocket even if
    // AWB/pickup for one leg fails; each leg is retried independently
    // from its own tracking state rather than failing the whole booking.
    await Promise.all([
      fwd.shipment_id ? tryAssignAwbAndPickup(supabase, forwardRow.id, fwd.shipment_id) : Promise.resolve(),
      ret.shipment_id ? tryAssignAwbAndPickup(supabase, returnRow.id, ret.shipment_id) : Promise.resolve(),
    ]);

    return jsonResponse({ shipments: shipmentRows, already_scheduled: false });
  } catch (e) {
    console.error("shiprocket-create-exchange error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
