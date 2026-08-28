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
  toIntOrNull,
} from "../_shared/shiprocket.ts";

// Parcel size defaults used whenever a product hasn't set its own -
// reasonable for folded apparel, documented here as the single source of
// truth for the fallback. Never blocks shipment creation on missing data.
const DEFAULT_LENGTH_CM = 25;
const DEFAULT_BREADTH_CM = 20;
const DEFAULT_HEIGHT_CM = 5;

function formatShiprocketDate(iso: string): string {
  return iso.slice(0, 19).replace("T", " ");
}

// The "Ship Now" action: vendor/admin has packed the order, this call
// creates the real Shiprocket order, assigns a courier, and books the
// pickup, all in one call via their Forward wrapper API. Everything after
// this point (in transit, delivered, NDR, RTO) is driven automatically by
// the shiprocket-webhook function - no further manual status updates.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vendor_order_id, courier_id, courier_etd } = await req.json();
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

    if (["cancelled", "returned"].includes(vendorOrder.status)) {
      return jsonResponse({ error: `Cannot ship a ${vendorOrder.status} order` }, 400);
    }

    const { data: existingShipment } = await supabase
      .from("shipments")
      .select("id, awb_code, courier_name, label_url, manifest_url, status")
      .eq("vendor_order_id", vendor_order_id)
      .eq("shipment_type", "forward")
      .maybeSingle();
    if (existingShipment?.awb_code) {
      return jsonResponse({ shipment: existingShipment, already_shipped: true });
    }

    const [{ data: order, error: orderErr }, { data: items, error: itemsErr }, { data: vendor, error: vendorErr }] =
      await Promise.all([
        supabase
          .from("orders")
          .select("id, customer_name, customer_email, customer_phone, shipping_address, payment_method, created_at")
          .eq("id", vendorOrder.order_id)
          .single(),
        supabase
          .from("order_items")
          .select("id, product_id, variant_id, product_title, variant_title, sku, quantity, price")
          .eq("vendor_order_id", vendor_order_id),
        supabase
          .from("vendors")
          .select("id, slug, name, contact_email, contact_phone, address, shiprocket_pickup_location")
          .eq("id", vendorOrder.vendor_id)
          .single(),
      ]);
    if (orderErr) throw orderErr;
    if (itemsErr) throw itemsErr;
    if (vendorErr) throw vendorErr;
    if (!items || items.length === 0) return jsonResponse({ error: "No items on this vendor order" }, 400);

    const productIds = items.map((i) => i.product_id).filter(Boolean);
    const { data: products } = await supabase
      .from("products")
      .select("id, sku, weight_grams")
      .in("id", productIds);
    const skuByProductId = new Map((products ?? []).map((p) => [p.id, p.sku]));

    // Cart items never carry a SKU snapshot (order_items.sku stays null
    // from checkout) - resolve one here instead, real variant sku first,
    // falling back to the product's own, then the order_item's own id so
    // Shiprocket always gets something rather than an empty string.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const variantIds = items.map((i) => i.variant_id).filter((id) => id && uuidRe.test(id));
    const { data: variants } = variantIds.length
      ? await supabase.from("product_variants").select("id, sku").in("id", variantIds)
      : { data: [] };
    const skuByVariantId = new Map((variants ?? []).map((v) => [v.id, v.sku]));

    const weightKg = await computeTotalWeightKg(supabase, items);

    const pickupLocation = await ensurePickupLocation(supabase, vendor as any);

    const shippingAddress = order.shipping_address as Record<string, string>;
    const isCod = order.payment_method === "cod";

    // Shiprocket treats this as an idempotency key on their side, not just
    // our own reference - confirmed live: reusing the bare vendor_order_id
    // on a retry after a cancellation returned the SAME stale cancelled
    // order (still bound to whatever pickup location it originally had)
    // instead of creating a genuinely fresh one, silently defeating a
    // pickup-address fix that should have applied. Unique per attempt.
    const channelOrderId = `${vendorOrder.id}-${Date.now()}`;

    const payload = {
      mode: "Surface",
      request_pickup: true,
      print_label: true,
      generate_manifest: true,
      order_id: channelOrderId,
      order_date: formatShiprocketDate(order.created_at),
      pickup_location: pickupLocation.name,
      billing_customer_name: order.customer_name,
      billing_last_name: "",
      billing_address: shippingAddress.address_line1,
      billing_address_2: shippingAddress.address_line2 || "",
      billing_city: shippingAddress.city,
      billing_state: shippingAddress.state,
      billing_country: shippingAddress.country || "India",
      billing_pincode: shippingAddress.pincode,
      billing_email: order.customer_email,
      billing_phone: order.customer_phone,
      shipping_is_billing: "1",
      order_items: items.map((item) => ({
        name: item.variant_title ? `${item.product_title} (${item.variant_title})` : item.product_title,
        sku: item.sku || skuByVariantId.get(item.variant_id) || skuByProductId.get(item.product_id) || item.id,
        units: item.quantity,
        hsn: "",
        selling_price: item.price,
        discount: "0",
        tax: "0",
      })),
      payment_method: isCod ? "COD" : "PREPAID",
      shipping_charges: vendorOrder.shipping_cost,
      total_discount: "0",
      sub_total: vendorOrder.subtotal,
      weight: weightKg,
      length: DEFAULT_LENGTH_CM,
      breadth: DEFAULT_BREADTH_CM,
      height: DEFAULT_HEIGHT_CM,
      // The vendor picked this courier from the real rate list shown
      // before booking - if omitted, Shiprocket silently auto-assigns one.
      ...(courier_id ? { courier_id } : {}),
    };

    const result = await shiprocketRequest(supabase, "/shipments/create/forward-shipment", {
      method: "POST",
      body: payload,
    });

    // Shiprocket returns HTTP 200 even for a logical failure here (bad
    // pickup location, invalid data, etc.) - status:1 is the real success
    // signal, with the actual result nested under `payload`.
    if (result.status !== 1) {
      const reason = result.payload?.error_message || "Shiprocket rejected the shipment request";
      throw new Error(reason);
    }
    const p = result.payload;

    const { data: shipment, error: insertErr } = await supabase
      .from("shipments")
      .insert({
        vendor_order_id,
        shipment_type: "forward",
        shiprocket_channel_order_id: channelOrderId,
        shiprocket_order_id: toIntOrNull(p.order_id),
        shiprocket_shipment_id: toIntOrNull(p.shipment_id),
        awb_code: p.awb_code || null,
        courier_id: toIntOrNull(p.courier_company_id),
        courier_name: p.courier_name ?? null,
        status: p.awb_code ? "awb_assigned" : "pending",
        label_url: p.label_url ?? null,
        manifest_url: p.manifest_url ?? null,
        estimated_delivery_date: estimatedDeliveryDate,
      })
      .select()
      .single();
    if (insertErr) {
      // The Shiprocket order genuinely exists at this point even though
      // we failed to record it - confirmed live (a DB-side failure here
      // left a real orphaned "NEW" order in Shiprocket with no local
      // record, which would have caused a duplicate booking on retry).
      // No AWB has been assigned yet, so cancelling it back out is safe.
      try {
        await shiprocketRequest(supabase, "/orders/cancel", { method: "POST", body: { ids: [toIntOrNull(p.order_id)] } });
      } catch (cancelErr) {
        console.error("shiprocket-create-shipment: failed to cancel orphaned Shiprocket order after DB insert failure", cancelErr);
      }
      throw insertErr;
    }

    await supabase.from("vendor_orders").update({ status: "confirmed" }).eq("id", vendor_order_id);

    return jsonResponse({ shipment, already_shipped: false });
  } catch (e) {
    console.error("shiprocket-create-shipment error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
