import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  isVendorMember,
  computeTotalWeightKg,
  checkCourierServiceability,
  errorMessage,
} from "../_shared/shiprocket.ts";

// Step 1 of "Ship Now": before booking anything, show the vendor which
// couriers actually service this pickup->delivery route and at what
// price, so they pick one instead of Shiprocket silently auto-assigning.
// Read-only - no Shiprocket order/AWB is created here.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vendor_order_id } = await req.json();
    if (!vendor_order_id) return jsonResponse({ error: "vendor_order_id is required" }, 400);

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();

    const { data: vendorOrder, error: voErr } = await supabase
      .from("vendor_orders")
      .select("id, order_id, vendor_id")
      .eq("id", vendor_order_id)
      .maybeSingle();
    if (voErr) throw voErr;
    if (!vendorOrder) return jsonResponse({ error: "Vendor order not found" }, 404);

    const authorized =
      (await isAdmin(supabase, userId)) || (await isVendorMember(supabase, userId, vendorOrder.vendor_id));
    if (!authorized) return jsonResponse({ error: "Forbidden" }, 403);

    const [{ data: order, error: orderErr }, { data: items, error: itemsErr }, { data: vendor, error: vendorErr }] =
      await Promise.all([
        supabase.from("orders").select("shipping_address, payment_method").eq("id", vendorOrder.order_id).single(),
        supabase.from("order_items").select("product_id, quantity").eq("vendor_order_id", vendor_order_id),
        supabase.from("vendors").select("address").eq("id", vendorOrder.vendor_id).single(),
      ]);
    if (orderErr) throw orderErr;
    if (itemsErr) throw itemsErr;
    if (vendorErr) throw vendorErr;
    if (!items || items.length === 0) return jsonResponse({ error: "No items on this vendor order" }, 400);

    const pickupPincode = (vendor.address as any)?.pincode;
    const deliveryPincode = (order.shipping_address as any)?.pincode;
    if (!pickupPincode) {
      return jsonResponse({ error: "Vendor pickup address has no pincode set - complete it in Store Settings first" }, 400);
    }
    if (!deliveryPincode) {
      return jsonResponse({ error: "Order has no delivery pincode" }, 400);
    }

    const weightKg = await computeTotalWeightKg(supabase, items);
    const couriers = await checkCourierServiceability(supabase, {
      pickupPincode,
      deliveryPincode,
      cod: order.payment_method === "cod",
      weightKg,
    });

    if (couriers.length === 0) {
      return jsonResponse({
        error: `No courier currently services ${pickupPincode} -> ${deliveryPincode}. Double-check the vendor's pickup pincode is correct.`,
      }, 400);
    }

    return jsonResponse({ couriers, weightKg });
  } catch (e) {
    console.error("shiprocket-check-serviceability error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
