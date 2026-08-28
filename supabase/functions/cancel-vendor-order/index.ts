import { corsHeaders, jsonResponse, serviceClient, getCallerUserId, isAdmin, errorMessage } from "../_shared/auth.ts";
import { cancelShiprocketShipment } from "../_shared/shiprocket.ts";
import { executeRefund, RefundValidationError } from "../_shared/refunds.ts";

// Cancellation is per-vendor, not whole-order - a multi-vendor cart has
// independent fulfillment per vendor_order, so only that vendor's own
// portion (and its own refund) is affected. Blocked once that vendor's
// own delivery is done, or if it's already cancelled/returned - "Rest of
// the status they can cancel" per the customer's own confirmed scope.
const BLOCKED_STATUSES = ["delivered", "cancelled", "returned"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vendor_order_id, reason } = await req.json();
    if (!vendor_order_id) return jsonResponse({ error: "vendor_order_id is required" }, 400);
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return jsonResponse({ error: "A reason is required" }, 400);
    }

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();

    const { data: vendorOrder, error: voErr } = await supabase
      .from("vendor_orders")
      .select("id, order_id, vendor_id, status, subtotal, shipping_cost")
      .eq("id", vendor_order_id)
      .maybeSingle();
    if (voErr) throw voErr;
    if (!vendorOrder) return jsonResponse({ error: "Order not found" }, 404);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, user_id, payment_method, payment_status")
      .eq("id", vendorOrder.order_id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    // Order-owner-or-admin only, deliberately not vendor-inclusive - a
    // vendor cancelling their own sale already has shiprocket-cancel-shipment
    // (no refund, admin/vendor path); this is the genuine customer path.
    const authorized = order.user_id === userId || (await isAdmin(supabase, userId));
    if (!authorized) return jsonResponse({ error: "Forbidden" }, 403);

    if (BLOCKED_STATUSES.includes(vendorOrder.status)) {
      return jsonResponse(
        { error: `This item is already ${vendorOrder.status} and can no longer be cancelled.` },
        400,
      );
    }

    // Best-effort: "already picked up" is handled inside cancelShiprocketShipment
    // and isn't an error, but anything else it throws (transient API error,
    // expired token) must not block the part actually owed to the customer -
    // their cancellation and refund. Logged, not fatal.
    let wasAlreadyShipped = false;
    try {
      const shipResult = await cancelShiprocketShipment(supabase, vendorOrder.id);
      wasAlreadyShipped = shipResult.alreadyPickedUp;
    } catch (e) {
      console.error("cancel-vendor-order: Shiprocket cancel failed, proceeding anyway", errorMessage(e));
    }

    const { error: updateVoErr } = await supabase
      .from("vendor_orders")
      .update({ status: "cancelled" })
      .eq("id", vendorOrder.id);
    if (updateVoErr) throw updateVoErr;

    // Only flip the parent order once every sibling vendor_order is also
    // cancelled - mirrors how orders.payment_status is left alone rather
    // than forced into a state its check constraint can't represent when
    // only part of a multi-vendor order is affected.
    const { data: siblingVendorOrders, error: siblingErr } = await supabase
      .from("vendor_orders")
      .select("status")
      .eq("order_id", order.id);
    if (siblingErr) throw siblingErr;
    const allCancelled = (siblingVendorOrders ?? []).every((vo) => vo.status === "cancelled");
    if (allCancelled) {
      const { error: updateOrderErr } = await supabase
        .from("orders")
        .update({ order_status: "cancelled" })
        .eq("id", order.id);
      if (updateOrderErr) throw updateOrderErr;
    }

    // subtotal + shipping_cost is what the customer actually paid for this
    // vendor's portion - net_payable is the vendor's post-commission payout
    // figure and would under-refund the customer (same distinction already
    // established in create-razorpay-refund).
    let refundId: string | null = null;
    let refundError: string | null = null;
    const refundAmount = Number(vendorOrder.subtotal) + Number(vendorOrder.shipping_cost);
    if (
      order.payment_method === "razorpay" &&
      (order.payment_status === "paid" || order.payment_status === "partially_refunded") &&
      refundAmount > 0
    ) {
      try {
        const result = await executeRefund(supabase, {
          orderId: order.id,
          amount: refundAmount,
          reason: `Order cancelled by customer: ${reason}`,
          initiatedBy: userId,
        });
        refundId = result.refundId;
      } catch (e) {
        // Must not undo the cancellation already applied above - the
        // customer's fulfillment is stopped either way. Surfaced in the
        // response and the admin/vendor email instead so a human follows
        // up on the refund specifically, rather than it being silently
        // lost in function logs nobody watches.
        refundError = e instanceof RefundValidationError ? e.message : errorMessage(e);
        console.error("cancel-vendor-order: refund failed", refundError);
      }
    }

    const { data: cancellationRow, error: insertErr } = await supabase
      .from("order_cancellations")
      .insert({
        order_id: order.id,
        vendor_order_id: vendorOrder.id,
        cancelled_by: userId,
        reason,
        was_already_shipped: wasAlreadyShipped,
        refund_id: refundId,
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    // Fire-and-forget - a notification failure must never undo an
    // already-completed cancellation, same pattern as every other email
    // trigger in this app.
    supabase.functions
      .invoke("send-order-email", {
        body: { orderId: order.id, type: "cancelled", vendorOrderId: vendorOrder.id },
      })
      .catch((e: unknown) => console.error("cancel-vendor-order: customer email failed", e));
    supabase.functions
      .invoke("send-order-cancellation-notice", {
        body: { order_cancellation_id: cancellationRow.id, refund_error: refundError },
      })
      .catch((e: unknown) => console.error("cancel-vendor-order: vendor/admin email failed", e));

    return jsonResponse({
      cancelled: true,
      refund_id: refundId,
      refund_error: refundError,
      was_already_shipped: wasAlreadyShipped,
    });
  } catch (e) {
    console.error("cancel-vendor-order error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
