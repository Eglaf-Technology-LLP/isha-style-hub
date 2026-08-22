import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  isVendorMember,
  shiprocketRequest,
} from "../_shared/shiprocket.ts";

const NOT_YET_PICKED_UP = ["pending", "awb_assigned", "pickup_scheduled"];

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

    const { data: shipment } = await supabase
      .from("shipments")
      .select("id, awb_code, shiprocket_order_id, status")
      .eq("vendor_order_id", vendor_order_id)
      .eq("shipment_type", "forward")
      .maybeSingle();

    if (shipment && !NOT_YET_PICKED_UP.includes(shipment.status)) {
      return jsonResponse(
        { error: `This order has already been picked up by the courier (status: ${shipment.status}) - cancel is no longer possible, use a return instead.` },
        400,
      );
    }

    if (shipment?.awb_code) {
      await shiprocketRequest(supabase, "/orders/cancel/shipment/awbs", {
        method: "POST",
        body: { awbs: [shipment.awb_code] },
      });
    } else if (shipment?.shiprocket_order_id) {
      await shiprocketRequest(supabase, "/orders/cancel", {
        method: "POST",
        body: { ids: [shipment.shiprocket_order_id] },
      });
    }
    // If no shipment was ever created, there's nothing to cancel on
    // Shiprocket's side - just flip the local status below.

    if (shipment) {
      await supabase.from("shipments").update({ status: "cancelled" }).eq("id", shipment.id);
    }
    await supabase.from("vendor_orders").update({ status: "cancelled" }).eq("id", vendor_order_id);

    return jsonResponse({ cancelled: true });
  } catch (e) {
    console.error("shiprocket-cancel-shipment error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
