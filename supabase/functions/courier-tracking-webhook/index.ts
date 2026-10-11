import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  mapShiprocketStatus,
  parseShiprocketTimestamp,
  errorMessage,
  toIntOrNull,
} from "../_shared/shiprocket.ts";
import { links, notifyAllAdmins, notifyUsers, notifyVendorMembers } from "../_shared/notify.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHIPMENT_COLUMNS =
  "id, shipment_type, vendor_order_id, order_id, return_request_id, dispatch_id, send_back_id, status, awb_code";

// Public endpoint - Shiprocket's own servers call this, not our frontend,
// so it can't rely on a Supabase user JWT (this function has
// verify_jwt = false in supabase/config.toml, the one exception in this
// project). Authenticity is instead checked via the x-api-key header we
// chose when configuring the webhook in Shiprocket's dashboard.
//
// Each leg moves different records:
//   forward / exchange_forward  boutique -> customer: the boutique order (as before)
//   to_warehouse                boutique -> warehouse: "on the way to / at the warehouse"
//                               - its "delivered" is NOT the customer's delivery
//   warehouse_to_customer       the warehouse's parcel: every boutique order in it
//                               (delivered here is what schedules payouts)
//   return* legs                the return request
//   warehouse_to_boutique       the send-back record
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
      .select(SHIPMENT_COLUMNS)
      .eq("awb_code", awbCode)
      .maybeSingle();

    if (!shipment && rawOrderId) {
      // order_id we send is now unique per booking attempt
      // (`${vendor_order_id}-${timestamp}`), not the bare vendor_order_id -
      // match on the exact value we recorded when creating the shipment.
      const byChannelId = await supabase
        .from("shipments")
        .select(SHIPMENT_COLUMNS)
        .eq("shiprocket_channel_order_id", rawOrderId)
        .maybeSingle();
      shipment = byChannelId.data;
    }

    if (!shipment && rawOrderId && UUID_RE.test(rawOrderId)) {
      // Return pickups use the bare return request id as their order_id;
      // older bookings used the bare vendor_order_id. Only tried for a real
      // UUID - comparing a uuid column against our composite
      // "<uuid>-<timestamp>" string would throw a type-cast error instead
      // of just not matching.
      const byReturn = await supabase
        .from("shipments")
        .select(SHIPMENT_COLUMNS)
        .eq("return_request_id", rawOrderId)
        .in("shipment_type", ["return", "return_to_warehouse"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      shipment = byReturn.data;
      if (!shipment) {
        const byVendorOrder = await supabase
          .from("shipments")
          .select(SHIPMENT_COLUMNS)
          .eq("vendor_order_id", rawOrderId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        shipment = byVendorOrder.data;
      }
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

    const type = shipment.shipment_type;
    const newlyCancelled = mapped.shipmentStatus === "cancelled" && shipment.status !== "cancelled";
    const s = mapped.shipmentStatus;

    // ---------- boutique's own parcel (to the customer, or to the warehouse) ----------
    if (type === "forward" || type === "exchange_forward" || type === "to_warehouse") {
      if (newlyCancelled && shipment.vendor_order_id) {
        // The vendor has to act (be ready, then book again) - a status change
        // alone is easy to miss, so it also goes to the notification bell.
        const { data: vo } = await supabase
          .from("vendor_orders")
          .select("vendor_id, order_id")
          .eq("id", shipment.vendor_order_id)
          .maybeSingle();
        const [{ data: members }, { data: admins }] = await Promise.all([
          vo
            ? supabase.from("vendor_members").select("user_id").eq("vendor_id", vo.vendor_id)
            : Promise.resolve({ data: [] as { user_id: string }[] }),
          supabase.from("user_roles").select("user_id").eq("role", "admin"),
        ]);
        // Same order number the boutique sees in its Orders list.
        const orderRef = `#${String(vo?.order_id ?? shipment.vendor_order_id).slice(0, 8)}`;
        const notifications = [
          ...(members ?? []).map((m) => ({ user_id: m.user_id, link_url: links.vendorOrder(shipment.vendor_order_id) })),
          ...(admins ?? []).map((a) => ({ user_id: a.user_id, link_url: links.adminOrder(shipment.vendor_order_id) })),
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

      if (type !== "to_warehouse") {
        if (mapped.vendorOrderStatus && shipment.vendor_order_id) {
          await supabase
            .from("vendor_orders")
            .update({ status: mapped.vendorOrderStatus })
            .eq("id", shipment.vendor_order_id)
            .not("status", "eq", "cancelled");
        }
      } else if (!shipment.return_request_id && shipment.vendor_order_id) {
        await handleInboundToWarehouse(supabase, shipment.vendor_order_id, s, statusRaw, awbCode);
      } else if (shipment.return_request_id && s === "delivered") {
        await notifyWarehouseStaff(supabase, {
          type: "warehouse_replacement_arrived",
          title: "Exchange replacement delivered",
          body: `A boutique's exchange replacement (AWB ${awbCode}) was delivered to the warehouse. Receive and inspect it.`,
          link: `/warehouse?tab=returns&focus=${shipment.return_request_id}`,
        });
      }
    }

    // ---------- the warehouse's parcel to the customer ----------
    if (type === "warehouse_to_customer" && shipment.dispatch_id) {
      await handleLastMile(supabase, shipment.dispatch_id, s, newlyCancelled, statusRaw, awbCode);
    }

    // ---------- returns (customer -> warehouse / boutique) ----------
    if ((type === "return" || type === "exchange_return" || type === "return_to_warehouse") && shipment.return_request_id) {
      if (type === "return_to_warehouse") {
        const map: Record<string, { to: string; from: string[] }> = {
          picked_up: { to: "picked_up", from: ["approved", "pickup_scheduled", "pickup_failed"] },
          in_transit: { to: "picked_up", from: ["approved", "pickup_scheduled", "pickup_failed"] },
          delivered: { to: "at_warehouse", from: ["approved", "pickup_scheduled", "picked_up", "pickup_failed"] },
          rto: { to: "pickup_failed", from: ["approved", "pickup_scheduled", "picked_up"] },
          ndr: { to: "pickup_failed", from: ["approved", "pickup_scheduled", "picked_up"] },
          lost: { to: "pickup_failed", from: ["approved", "pickup_scheduled", "picked_up"] },
          cancelled: { to: "pickup_failed", from: ["approved", "pickup_scheduled", "picked_up"] },
        };
        const step = map[s];
        if (step) {
          const { data: updated } = await supabase
            .from("return_requests")
            .update({ status: step.to })
            .eq("id", shipment.return_request_id)
            .in("status", step.from)
            .select("id")
            .maybeSingle();
          if (updated && step.to === "pickup_failed") {
            supabase.functions
              .invoke("send-return-status-email", {
                body: { returnRequestId: shipment.return_request_id, newStatus: "pickup_failed" },
              })
              .catch((e: unknown) => console.error("courier-tracking-webhook: pickup_failed notice failed", e));
          }
          if (updated && step.to === "at_warehouse") {
            await notifyWarehouseStaff(supabase, {
              type: "warehouse_return_arrived",
              title: "Return delivered to the warehouse",
              body: `A customer return (AWB ${awbCode}) was delivered. Receive and inspect it.`,
              link: `/warehouse?tab=returns&focus=${shipment.return_request_id}`,
            });
          }
        }
      } else {
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
        const newReturnStatus = returnStatusMap[s];
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
    }

    // ---------- warehouse -> boutique ----------
    if (type === "warehouse_to_boutique" && shipment.send_back_id) {
      if (s === "delivered") {
        await supabase.from("boutique_send_backs").update({ status: "delivered" }).eq("id", shipment.send_back_id);
      } else if (newlyCancelled) {
        await supabase.from("boutique_send_backs").update({ status: "required" }).eq("id", shipment.send_back_id).eq("status", "booked");
        await notifyWarehouseStaff(supabase, {
          type: "pickup_cancelled",
          title: "Courier pickup cancelled",
          body: `${statusRaw} (AWB ${awbCode}) for a parcel back to a boutique. Please book it again.`,
          link: `/warehouse?tab=sendbacks`,
        });
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

async function notifyWarehouseStaff(
  supabase: ReturnType<typeof serviceClient>,
  n: { type: string; title: string; body: string; link: string },
) {
  const { data } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "warehouse_staff"]);
  await notifyUsers(supabase, [...new Set((data ?? []).map((r) => r.user_id))], n);
}

// Boutique -> warehouse. Its "delivered" only means the parcel reached the
// warehouse - payouts and the customer's "delivered" wait for the
// warehouse's own parcel.
async function handleInboundToWarehouse(
  supabase: ReturnType<typeof serviceClient>,
  vendorOrderId: string,
  s: string,
  statusRaw: string,
  awbCode: string,
) {
  if (s === "picked_up" || s === "in_transit" || s === "out_for_delivery") {
    await supabase
      .from("vendor_orders")
      .update({ status: "in_transit_to_warehouse" })
      .eq("id", vendorOrderId)
      .in("status", ["pending", "confirmed", "processing"]);
    return;
  }
  if (s === "delivered") {
    const { data: vo } = await supabase
      .from("vendor_orders")
      .update({ status: "at_warehouse", arrived_at_warehouse_at: new Date().toISOString() })
      .eq("id", vendorOrderId)
      .in("status", ["pending", "confirmed", "processing", "in_transit_to_warehouse"])
      .select("id, order_id")
      .maybeSingle();
    const { data: cancelled } = vo
      ? { data: null }
      : await supabase.from("vendor_orders").select("id, order_id, status").eq("id", vendorOrderId).maybeSingle();
    await notifyWarehouseStaff(supabase, {
      type: "warehouse_parcel_arrived",
      title: cancelled?.status === "cancelled" ? "Cancelled parcel delivered" : "Parcel delivered to the warehouse",
      body:
        cancelled?.status === "cancelled"
          ? `A parcel (AWB ${awbCode}) for a cancelled order was delivered. Receive it - it goes back to the boutique.`
          : `A boutique's parcel (AWB ${awbCode}) for order #${String(vo?.order_id ?? "").slice(0, 8)} was delivered. Receive and inspect it.`,
      link: `/warehouse?tab=inspect&focus=${vendorOrderId}`,
    });
    return;
  }
  if (s === "rto") {
    // The parcel is going back to the boutique - they book it again.
    const { data: vo } = await supabase
      .from("vendor_orders")
      .update({ status: "confirmed" })
      .eq("id", vendorOrderId)
      .in("status", ["processing", "in_transit_to_warehouse"])
      .select("vendor_id, order_id")
      .maybeSingle();
    if (vo) {
      const body = `The courier is returning the parcel for order #${String(vo.order_id).slice(0, 8)} to you (${statusRaw}, AWB ${awbCode}). Please book it to the warehouse again once it's back.`;
      await notifyVendorMembers(supabase, vo.vendor_id, {
        type: "warehouse_inbound_rto",
        title: "Parcel to the warehouse is coming back",
        body,
        link: links.vendorOrder(vendorOrderId),
      });
      await notifyAllAdmins(supabase, {
        type: "warehouse_inbound_rto",
        title: "Parcel to the warehouse is coming back",
        body,
        link: links.adminOrder(vendorOrderId),
        category: "order",
      });
    }
    return;
  }
  if (s === "ndr" || s === "lost") {
    await notifyWarehouseStaff(supabase, {
      type: "warehouse_inbound_problem",
      title: s === "lost" ? "Parcel to the warehouse lost" : "Courier couldn't deliver to the warehouse",
      body: `${statusRaw} (AWB ${awbCode}). Check with the courier.`,
      link: `/warehouse?tab=incoming&focus=${vendorOrderId}`,
    });
  }
}

// Warehouse -> customer. For an order parcel every boutique order inside
// moves together - "delivered" here schedules each boutique's payout.
async function handleLastMile(
  supabase: ReturnType<typeof serviceClient>,
  dispatchId: string,
  s: string,
  newlyCancelled: boolean,
  statusRaw: string,
  awbCode: string,
) {
  const { data: dispatch } = await supabase
    .from("warehouse_dispatches")
    .select("id, order_id, purpose, return_request_id, status")
    .eq("id", dispatchId)
    .maybeSingle();
  if (!dispatch) return;

  if (newlyCancelled) {
    // The courier dropped the pickup: back to "packed, not booked".
    await supabase.from("warehouse_dispatches").update({ status: "packing" }).eq("id", dispatchId).eq("status", "booked");
    await notifyWarehouseStaff(supabase, {
      type: "pickup_cancelled",
      title: "Courier pickup cancelled",
      body: `${statusRaw} (AWB ${awbCode}) for order #${String(dispatch.order_id).slice(0, 8)}. Please book the parcel again.`,
      link: `/warehouse?tab=pack&focus=${dispatch.order_id}`,
    });
    return;
  }

  const dispatchStatus: Record<string, string> = {
    picked_up: "shipped",
    in_transit: "shipped",
    out_for_delivery: "shipped",
    delivered: "delivered",
    ndr: "ndr",
    rto: "rto",
  };
  if (dispatchStatus[s]) {
    await supabase
      .from("warehouse_dispatches")
      .update({ status: dispatchStatus[s] })
      .eq("id", dispatchId)
      .not("status", "in", "(cancelled,delivered)");
  }

  if (dispatch.purpose === "order") {
    const vendorOrderStatus: Record<string, string> = {
      picked_up: "shipped",
      in_transit: "shipped",
      out_for_delivery: "out_for_delivery",
      delivered: "delivered",
      ndr: "ndr",
      rto: "returned",
    };
    const next = vendorOrderStatus[s];
    if (next) {
      // The whole order's status follows (sync_order_status_from_parts).
      await supabase
        .from("vendor_orders")
        .update({ status: next })
        .eq("dispatch_id", dispatchId)
        .not("status", "in", "(cancelled,delivered)");
    }
    if (s === "rto") {
      await notifyWarehouseStaff(supabase, {
        type: "warehouse_rto",
        title: "Parcel couldn't be delivered",
        body: `The parcel for order #${String(dispatch.order_id).slice(0, 8)} is coming back to the warehouse (${statusRaw}). Receive it, then admin decides to send it again or cancel.`,
        link: `/warehouse?tab=dispatched&focus=${dispatch.order_id}`,
      });
    }
    return;
  }

  if (!dispatch.return_request_id) return;
  if (dispatch.purpose === "exchange_replacement") {
    const next = s === "delivered" ? "completed" : ["picked_up", "in_transit", "out_for_delivery"].includes(s) ? "replacement_shipped" : null;
    if (next) {
      await supabase
        .from("return_requests")
        .update({ status: next })
        .eq("id", dispatch.return_request_id)
        .not("status", "in", "(completed,cancelled,rejected)");
    }
  } else if (dispatch.purpose === "return_send_back" && s === "delivered") {
    await supabase
      .from("return_requests")
      .update({ status: "returned_to_customer" })
      .eq("id", dispatch.return_request_id)
      .eq("status", "qc_failed");
  }
}
