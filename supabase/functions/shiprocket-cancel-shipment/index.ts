import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  isVendorMember,
  errorMessage,
  cancelShiprocketShipment,
} from "../_shared/shiprocket.ts";

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
      .select("id, vendor_id, status")
      .eq("id", vendor_order_id)
      .maybeSingle();
    if (voErr) throw voErr;
    if (!vendorOrder) return jsonResponse({ error: "Vendor order not found" }, 404);

    const authorized =
      (await isAdmin(supabase, userId)) || (await isVendorMember(supabase, userId, vendorOrder.vendor_id));
    if (!authorized) return jsonResponse({ error: "Forbidden" }, 403);

    const result = await cancelShiprocketShipment(supabase, vendor_order_id);

    if (result.alreadyPickedUp) {
      return jsonResponse(
        { error: "This order has already been picked up by the courier - cancel is no longer possible, use a return instead." },
        400,
      );
    }

    await supabase.from("vendor_orders").update({ status: "cancelled" }).eq("id", vendor_order_id);

    return jsonResponse({ cancelled: true });
  } catch (e) {
    console.error("shiprocket-cancel-shipment error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
