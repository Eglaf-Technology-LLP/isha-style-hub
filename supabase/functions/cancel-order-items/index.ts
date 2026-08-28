import { corsHeaders, jsonResponse, serviceClient, getCallerUserId, isAdmin, errorMessage } from "../_shared/auth.ts";
import { cancelOneVendorOrder } from "../_shared/cancellation.ts";

// Covers "cancel one item", "cancel several items" (possibly spanning a
// couple of shipments), and "cancel the whole order" with one code path -
// the customer only ever picks items, never a shipment/vendor; the caller
// (OrderCancellationDialog) resolves the item selection down to the set of
// vendor_order_ids that actually need cancelling before calling this.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vendor_order_ids, reason } = await req.json();
    if (!Array.isArray(vendor_order_ids) || vendor_order_ids.length === 0) {
      return jsonResponse({ error: "vendor_order_ids is required" }, 400);
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return jsonResponse({ error: "A reason is required" }, 400);
    }

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();

    const { data: requestedVendorOrders, error: voErr } = await supabase
      .from("vendor_orders")
      .select("id, order_id, status, subtotal, shipping_cost")
      .in("id", vendor_order_ids);
    if (voErr) throw voErr;

    const foundIds = new Set((requestedVendorOrders ?? []).map((vo) => vo.id));
    const notFound = vendor_order_ids.filter((id: string) => !foundIds.has(id));

    if (!requestedVendorOrders || requestedVendorOrders.length === 0) {
      return jsonResponse({ error: "None of the given items could be found" }, 404);
    }

    // A customer's item selection only ever comes from one order's own
    // page - if these span more than one order, something is wrong with
    // the request (tampered ids, a UI bug), not a legitimate case.
    const orderIds = new Set(requestedVendorOrders.map((vo) => vo.order_id));
    if (orderIds.size > 1) {
      return jsonResponse({ error: "All items must belong to the same order" }, 400);
    }
    const orderId = requestedVendorOrders[0].order_id;

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, user_id, payment_method, payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    // Order-owner-or-admin only, same as before - a vendor cancelling
    // their own sale already has shiprocket-cancel-shipment.
    const authorized = order.user_id === userId || (await isAdmin(supabase, userId));
    if (!authorized) return jsonResponse({ error: "Forbidden" }, 403);

    const results = [];
    for (const vendorOrder of requestedVendorOrders) {
      const result = await cancelOneVendorOrder(supabase, {
        vendorOrder,
        order,
        cancelledBy: userId,
        reason,
      });
      results.push(result);
    }

    // Recompute against every sibling vendor_order currently on the order,
    // not just the ones in this request - only flips once ALL of them are
    // cancelled, mirroring how orders.payment_status is left alone rather
    // than forced into a state its check constraint can't represent when
    // only part of the order is affected.
    const { data: allVendorOrders, error: allVoErr } = await supabase
      .from("vendor_orders")
      .select("status")
      .eq("order_id", orderId);
    if (allVoErr) throw allVoErr;
    const allCancelled = (allVendorOrders ?? []).every((vo) => vo.status === "cancelled");
    if (allCancelled) {
      const { error: updateOrderErr } = await supabase
        .from("orders")
        .update({ order_status: "cancelled" })
        .eq("id", orderId);
      if (updateOrderErr) throw updateOrderErr;
    }

    // Fire-and-forget per shipment actually cancelled - a notification
    // failure must never undo an already-completed cancellation.
    for (const result of results) {
      if (!result.cancelled || !result.cancellationId) continue;
      supabase.functions
        .invoke("send-order-email", {
          body: { orderId, type: "cancelled", vendorOrderId: result.vendorOrderId },
        })
        .catch((e: unknown) => console.error("cancel-order-items: customer email failed", e));
      supabase.functions
        .invoke("send-order-cancellation-notice", {
          body: { order_cancellation_id: result.cancellationId, refund_error: result.refundError },
        })
        .catch((e: unknown) => console.error("cancel-order-items: vendor/admin email failed", e));
    }

    const skipped = [
      ...results.filter((r) => !r.cancelled).map((r) => ({ vendor_order_id: r.vendorOrderId, reason: r.skippedReason })),
      ...notFound.map((id: string) => ({ vendor_order_id: id, reason: "not found" })),
    ];

    return jsonResponse({
      cancelled: results
        .filter((r) => r.cancelled)
        .map((r) => ({
          vendor_order_id: r.vendorOrderId,
          refund_id: r.refundId,
          refund_error: r.refundError,
          was_already_shipped: r.wasAlreadyShipped,
        })),
      skipped,
    });
  } catch (e) {
    console.error("cancel-order-items error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
