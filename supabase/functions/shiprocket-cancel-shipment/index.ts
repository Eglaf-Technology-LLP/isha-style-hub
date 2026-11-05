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

    // This is "undo the booking so a different courier can be picked," not
    // "cancel the order" - deliberately never touches vendor_orders.status.
    // Genuinely cancelling a vendor's fulfillment is a separate, explicit
    // action (cancel-order-items) with its own refund/notification
    // handling - this function must never have that side effect.
    const result = await cancelShiprocketShipment(supabase, vendor_order_id, { deleteOnCancel: true });

    if (!result.attempted) {
      return jsonResponse({ error: "No shipment booking found to cancel" }, 400);
    }
    if (result.alreadyPickedUp) {
      return jsonResponse(
        { error: "This order has already been picked up by the courier - cancel is no longer possible, use a return instead." },
        400,
      );
    }

    return jsonResponse({ cancelled: true });
  } catch (e) {
    console.error("shiprocket-cancel-shipment error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
