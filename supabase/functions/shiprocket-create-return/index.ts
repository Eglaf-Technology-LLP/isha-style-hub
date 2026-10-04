import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  canBookReturnPickup,
  ensurePickupLocation,
  shiprocketRequest,
  errorMessage,
  toIntOrNull,
} from "../_shared/shiprocket.ts";

const DEFAULT_ITEM_WEIGHT_GRAMS = 300;
const DEFAULT_LENGTH_CM = 25;
const DEFAULT_BREADTH_CM = 20;
const DEFAULT_HEIGHT_CM = 5;

function formatShiprocketDate(iso: string): string {
  return iso.slice(0, 19).replace("T", " ");
}

// Admin-triggered when approving a return request: books the actual
// reverse pickup from the customer's address to the vendor's registered
// pickup location. Three real Shiprocket calls in sequence (their return
// API, unlike the Forward wrapper, doesn't bundle AWB assignment or
// pickup scheduling): create the return order, assign a courier/AWB,
// then request the pickup.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { return_request_id } = await req.json();
    if (!return_request_id) return jsonResponse({ error: "return_request_id is required" }, 400);

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    if (!(await canBookReturnPickup(supabase, userId, return_request_id))) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: returnRequest, error: rrErr } = await supabase
      .from("return_requests")
      .select("id, order_id, request_type, items, refund_amount, created_at")
      .eq("id", return_request_id)
      .maybeSingle();
    if (rrErr) throw rrErr;
    if (!returnRequest) return jsonResponse({ error: "Return request not found" }, 404);
    if (returnRequest.request_type !== "return") {
      return jsonResponse({ error: "This is an exchange request - use shiprocket-create-exchange instead" }, 400);
    }

    const { data: existingShipment } = await supabase
      .from("shipments")
      .select("id, awb_code")
      .eq("return_request_id", return_request_id)
      .maybeSingle();
    if (existingShipment) {
      return jsonResponse({ shipment: existingShipment, already_scheduled: true });
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, customer_name, customer_email, customer_phone, shipping_address")
      .eq("id", returnRequest.order_id)
      .single();
    if (orderErr) throw orderErr;

    const orderItemIds = (returnRequest.items as any[]).map((i) => i.order_item_id).filter(Boolean);
    const { data: orderItems, error: oiErr } = await supabase
      .from("order_items")
      .select("id, vendor_id, vendor_order_id, product_id, sku")
      .in("id", orderItemIds);
    if (oiErr) throw oiErr;

    const vendorIds = [...new Set((orderItems ?? []).map((i) => i.vendor_id).filter(Boolean))];
    if (vendorIds.length === 0) return jsonResponse({ error: "Could not resolve a vendor for this return" }, 400);
    if (vendorIds.length > 1) {
      return jsonResponse({ error: "This return spans multiple vendors - not supported in one pickup" }, 400);
    }
    const vendorOrderId = orderItems![0].vendor_order_id;

    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .select("id, slug, name, contact_email, contact_phone, address, shiprocket_pickup_location")
      .eq("id", vendorIds[0])
      .single();
    if (vendorErr) throw vendorErr;

    // Return orders address the vendor destination via explicit
    // shipping_* fields below, not a pickup_location name - this call is
    // only to guarantee the vendor is registered with Shiprocket at all.
    await ensurePickupLocation(supabase, vendor as any);
    const vendorAddress = (vendor.address ?? {}) as Record<string, string>;
    const customerAddress = order.shipping_address as Record<string, string>;

    const items = returnRequest.items as any[];
    const skuByOrderItemId = new Map((orderItems ?? []).map((i) => [i.id, i.sku]));
    const subTotal = items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);
    const totalWeightGrams = items.reduce(
      (sum, i) => sum + DEFAULT_ITEM_WEIGHT_GRAMS * i.quantity,
      0,
    );

    const createResult = await shiprocketRequest(supabase, "/orders/create/return", {
      method: "POST",
      body: {
        order_id: returnRequest.id,
        order_date: formatShiprocketDate(returnRequest.created_at),
        // Reverse pickup: Shiprocket collects FROM the customer, delivers
        // TO the vendor - the opposite of a forward shipment.
        pickup_customer_name: order.customer_name,
        pickup_address: customerAddress.address_line1,
        pickup_address_2: customerAddress.address_line2 || "",
        pickup_city: customerAddress.city,
        pickup_state: customerAddress.state,
        pickup_country: customerAddress.country || "India",
        pickup_pincode: customerAddress.pincode,
        pickup_email: order.customer_email,
        pickup_phone: order.customer_phone,
        shipping_customer_name: vendor.name,
        shipping_address: vendorAddress.address_line1,
        shipping_address_2: vendorAddress.address_line2 || "",
        shipping_city: vendorAddress.city,
        shipping_state: vendorAddress.state,
        shipping_country: vendorAddress.country || "India",
        shipping_pincode: vendorAddress.pincode,
        shipping_email: vendor.contact_email,
        shipping_phone: vendor.contact_phone,
        order_items: items.map((i) => ({
          name: i.product_title,
          sku: skuByOrderItemId.get(i.order_item_id) || i.order_item_id,
          units: i.quantity,
          selling_price: i.price ?? 0,
          discount: 0,
          hsn: "",
        })),
        payment_method: "PREPAID",
        sub_total: returnRequest.refund_amount || subTotal,
        length: DEFAULT_LENGTH_CM,
        breadth: DEFAULT_BREADTH_CM,
        height: DEFAULT_HEIGHT_CM,
        weight: Math.max(totalWeightGrams / 1000, 0.1),
      },
    });

    const { data: shipment, error: insertErr } = await supabase
      .from("shipments")
      .insert({
        vendor_order_id: vendorOrderId,
        return_request_id,
        shipment_type: "return",
        shiprocket_order_id: toIntOrNull(createResult.order_id),
        shiprocket_shipment_id: toIntOrNull(createResult.shipment_id),
        status: "pending",
        status_raw: createResult.status ?? null,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    // Best-effort from here - the return order genuinely exists in
    // Shiprocket even if AWB assignment or pickup scheduling fails; the
    // admin can retry those from the shipment's tracking state rather
    // than the whole booking failing atomically.
    try {
      const awbResult = await shiprocketRequest(supabase, "/courier/assign/awb", {
        method: "POST",
        body: { shipment_id: createResult.shipment_id },
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
          .eq("id", shipment.id);

        await shiprocketRequest(supabase, "/courier/generate/pickup", {
          method: "POST",
          body: { shipment_id: [createResult.shipment_id] },
        });
        await supabase.from("shipments").update({ status: "pickup_scheduled" }).eq("id", shipment.id);
      }
    } catch (followUpErr) {
      console.error("shiprocket-create-return: AWB/pickup follow-up failed", followUpErr);
    }

    return jsonResponse({ shipment, already_scheduled: false });
  } catch (e) {
    console.error("shiprocket-create-return error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
