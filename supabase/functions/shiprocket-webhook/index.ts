import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  mapShiprocketStatus,
  parseShiprocketTimestamp,
} from "../_shared/shiprocket.ts";

// Public endpoint - Shiprocket's own servers call this, not our frontend,
// so it can't rely on a Supabase user JWT (this function has
// verify_jwt = false in supabase/config.toml, the one exception in this
// project). Authenticity is instead checked via the x-api-key header we
// chose when configuring the webhook in Shiprocket's dashboard.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expectedToken = Deno.env.get("SHIPROCKET_WEBHOOK_TOKEN");
  const providedToken = req.headers.get("x-api-key");
  if (!expectedToken || providedToken !== expectedToken) {
    console.error("shiprocket-webhook: missing/invalid x-api-key");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await req.json();
    const awbCode: string | undefined = payload.awb;
    const rawOrderId: string | undefined = payload.order_id;
    const rawStatus: string = payload.current_status || payload.shipment_status || "";

    if (!awbCode) {
      return jsonResponse({ error: "Missing awb in payload" }, 400);
    }

    const supabase = serviceClient();

    let { data: shipment } = await supabase
      .from("shipments")
      .select("id, shipment_type, vendor_order_id, return_request_id, status")
      .eq("awb_code", awbCode)
      .maybeSingle();

    if (!shipment && rawOrderId) {
      const fallback = await supabase
        .from("shipments")
        .select("id, shipment_type, vendor_order_id, return_request_id, status")
        .eq("vendor_order_id", rawOrderId)
        .maybeSingle();
      shipment = fallback.data;
    }

    // Always record the raw event for the audit trail, even if we
    // couldn't match it to a shipment yet - "verify if anything is
    // missing or wrong" needs the full history, not just recognized ones.
    const eventTimestamp = parseShiprocketTimestamp(payload.current_timestamp);

    await supabase.from("shipment_events").insert({
      shipment_id: shipment?.id ?? null,
      awb_code: awbCode,
      event_status: rawStatus || null,
      event_status_id: payload.current_status_id ?? payload.shipment_status_id ?? null,
      activity: payload.scans?.[0]?.activity ?? null,
      location: payload.scans?.[0]?.location ?? null,
      event_timestamp: eventTimestamp,
      raw_payload: payload,
    });

    if (!shipment) {
      console.error("shiprocket-webhook: no matching shipment for awb", awbCode, "order_id", rawOrderId);
      return jsonResponse({ received: true, matched: false });
    }

    const mapped = mapShiprocketStatus(rawStatus);
    const now = new Date().toISOString();
    const timestampColumn: Record<string, string> = {
      pickup_scheduled: "pickup_scheduled_at",
      picked_up: "picked_up_at",
      delivered: "delivered_at",
      rto: "rto_initiated_at",
    };
    const extraTimestamp = timestampColumn[mapped.shipmentStatus]
      ? { [timestampColumn[mapped.shipmentStatus]]: now }
      : {};

    await supabase
      .from("shipments")
      .update({ status: mapped.shipmentStatus, status_raw: rawStatus, ...extraTimestamp })
      .eq("id", shipment.id);

    const isForwardLeg = shipment.shipment_type === "forward" || shipment.shipment_type === "exchange_forward";
    const isReturnLeg = shipment.shipment_type === "return" || shipment.shipment_type === "exchange_return";

    if (isForwardLeg && mapped.vendorOrderStatus) {
      await supabase
        .from("vendor_orders")
        .update({ status: mapped.vendorOrderStatus })
        .eq("id", shipment.vendor_order_id)
        .not("status", "eq", "cancelled");
    }

    if (isReturnLeg && shipment.return_request_id) {
      const returnStatusMap: Record<string, string> = {
        picked_up: "picked_up",
        delivered: "completed",
      };
      const newReturnStatus = returnStatusMap[mapped.shipmentStatus];
      if (newReturnStatus) {
        await supabase
          .from("return_requests")
          .update({ status: newReturnStatus })
          .eq("id", shipment.return_request_id)
          .not("status", "in", "(rejected,cancelled,completed)");
      }
    }

    return jsonResponse({ received: true, matched: true });
  } catch (e) {
    console.error("shiprocket-webhook error", e);
    // Still 200 here would hide real bugs; Shiprocket retries on non-200,
    // which is the right behavior for a genuine processing failure.
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
