import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  mapShiprocketStatus,
  parseShiprocketTimestamp,
  errorMessage,
  toIntOrNull,
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
    console.error("courier-tracking-webhook: missing/invalid x-api-key");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    // Shiprocket's dashboard "Test Webhook" button (and any bare
    // connectivity ping) sends an empty/near-empty body, not a real
    // event - req.json() throws on that, which used to 500 back to
    // Shiprocket and could read as "the endpoint is broken" in their UI
    // even though auth and routing both succeeded. Treat an unparseable
    // or awb-less body as a successful test ping instead of an error.
    const payload = await req.json().catch(() => ({}));
    const awbCode: string | undefined = payload.awb;
    const rawOrderId: string | undefined = payload.order_id;
    const rawStatus: string = payload.current_status || payload.shipment_status || "";

    if (!awbCode) {
      // 200, not 400 - a real event always has an awb, so a missing one
      // is a test/ping, not a malformed real call. A non-2xx here is
      // exactly what makes Shiprocket's dashboard show the connection as
      // failing even though the token and URL are both actually correct.
      return jsonResponse({ received: true, test: true });
    }

    const supabase = serviceClient();

    let { data: shipment } = await supabase
      .from("shipments")
      .select("id, shipment_type, vendor_order_id, return_request_id, status, awb_code")
      .eq("awb_code", awbCode)
      .maybeSingle();

    if (!shipment && rawOrderId) {
      // order_id we send is now unique per booking attempt
      // (`${vendor_order_id}-${timestamp}`), not the bare vendor_order_id -
      // match on the exact value we recorded when creating the shipment.
      const byChannelId = await supabase
        .from("shipments")
        .select("id, shipment_type, vendor_order_id, return_request_id, status, awb_code")
        .eq("shiprocket_channel_order_id", rawOrderId)
        .maybeSingle();
      shipment = byChannelId.data;
    }

    if (!shipment && rawOrderId) {
      // Return/exchange shipments still use the bare vendor_order_id as
      // their order_id - only try this if rawOrderId looks like a real
      // UUID, since vendor_order_id is a uuid column and comparing it
      // against our composite "<uuid>-<timestamp>" string would otherwise
      // throw a Postgres type-cast error instead of just not matching.
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const fallback = uuidRe.test(rawOrderId)
        ? await supabase
            .from("shipments")
            .select("id, shipment_type, vendor_order_id, return_request_id, status, awb_code")
            .eq("vendor_order_id", rawOrderId)
            .maybeSingle()
        : { data: null };
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
      event_status_id: toIntOrNull(payload.current_status_id ?? payload.shipment_status_id),
      activity: payload.scans?.[0]?.activity ?? null,
      location: payload.scans?.[0]?.location ?? null,
      event_timestamp: eventTimestamp,
      raw_payload: payload,
    });

    if (!shipment) {
      console.error("courier-tracking-webhook: no matching shipment for awb", awbCode, "order_id", rawOrderId);
      return jsonResponse({ received: true, matched: false });
    }

    // Shiprocket's auto-cancel after failed pickup attempts never sends a
    // "cancelled" status - it releases the AWB and puts the order back to
    // NEW (confirmed from a real payload: current_status "NEW",
    // awb_assigned_date null, pickup_attempt_count 3, pickup_exception_reason
    // "No Pickup / Shipment Not Ready"). A NEW event for a booking that
    // already had an AWB therefore means the courier dropped the pickup.
    const courierDroppedPickup =
      rawStatus.trim().toUpperCase() === "NEW" && !payload.awb_assigned_date && !!shipment.awb_code;
    const mapped = courierDroppedPickup
      ? { shipmentStatus: "cancelled", vendorOrderStatus: null }
      : mapShiprocketStatus(rawStatus);
    const statusRaw = courierDroppedPickup
      ? `Pickup cancelled by courier${payload.pickup_exception_reason ? ` - ${payload.pickup_exception_reason}` : ""}`
      : rawStatus;
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
      .update({ status: mapped.shipmentStatus, status_raw: statusRaw, ...extraTimestamp })
      .eq("id", shipment.id);

    const isForwardLeg = shipment.shipment_type === "forward" || shipment.shipment_type === "exchange_forward";
    const isReturnLeg = shipment.shipment_type === "return" || shipment.shipment_type === "exchange_return";

    if (isForwardLeg && mapped.shipmentStatus === "cancelled" && shipment.status !== "cancelled") {
      // The vendor has to act (be ready, then book again) - a status change
      // alone is easy to miss, so it also goes to the notification bell.
      const { data: vo } = await supabase
        .from("vendor_orders")
        .select("vendor_id")
        .eq("id", shipment.vendor_order_id)
        .maybeSingle();
      const [{ data: members }, { data: admins }] = await Promise.all([
        vo
          ? supabase.from("vendor_members").select("user_id").eq("vendor_id", vo.vendor_id)
          : Promise.resolve({ data: [] as { user_id: string }[] }),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
      ]);
      const orderRef = `#${String(shipment.vendor_order_id).slice(0, 8).toUpperCase()}`;
      const notifications = [
        ...(members ?? []).map((m) => ({ user_id: m.user_id, link_url: "/vendor" })),
        ...(admins ?? []).map((a) => ({ user_id: a.user_id, link_url: "/admin" })),
      ].map((n) => ({
        ...n,
        category: "order",
        type: "pickup_cancelled",
        title: "Courier pickup cancelled",
        body: `${statusRaw} (AWB ${awbCode}) for order ${orderRef}. Please book the shipment again.`,
      }));
      if (notifications.length) {
        const { error: notifyErr } = await supabase.from("notifications").insert(notifications);
        if (notifyErr) console.error("courier-tracking-webhook: pickup-cancel notification failed", notifyErr);
      }
    }

    if (isForwardLeg && mapped.vendorOrderStatus) {
      await supabase
        .from("vendor_orders")
        .update({ status: mapped.vendorOrderStatus })
        .eq("id", shipment.vendor_order_id)
        .not("status", "eq", "cancelled");
    }

    if (isReturnLeg && shipment.return_request_id) {
      // rto/ndr/lost/cancelled on the reverse leg used to no-op here
      // entirely - return_requests.status stayed on "approved" forever
      // with no signal to anyone that the pickup actually failed. Mapped
      // to a distinct status instead of being silently dropped.
      const returnStatusMap: Record<string, string> = {
        picked_up: "picked_up",
        delivered: "completed",
        rto: "pickup_failed",
        ndr: "pickup_failed",
        lost: "pickup_failed",
        cancelled: "pickup_failed",
      };
      const newReturnStatus = returnStatusMap[mapped.shipmentStatus];
      if (newReturnStatus) {
        const { data: updatedRequest } = await supabase
          .from("return_requests")
          .update({ status: newReturnStatus })
          .eq("id", shipment.return_request_id)
          .not("status", "in", "(rejected,cancelled,completed)")
          .select("id")
          .maybeSingle();

        if (updatedRequest && newReturnStatus === "pickup_failed") {
          supabase.functions
            .invoke("send-return-status-email", {
              body: { returnRequestId: shipment.return_request_id, newStatus: "pickup_failed" },
            })
            .catch((e: unknown) => console.error("courier-tracking-webhook: pickup_failed notice failed", e));
        }
      }
    }

    return jsonResponse({ received: true, matched: true });
  } catch (e) {
    console.error("courier-tracking-webhook error", e);
    // Still 200 here would hide real bugs; Shiprocket retries on non-200,
    // which is the right behavior for a genuine processing failure.
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
