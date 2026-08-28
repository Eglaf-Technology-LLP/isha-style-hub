import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { errorMessage } from "./auth.ts";
import { cancelShiprocketShipment } from "./shiprocket.ts";
import { executeRefund, RefundValidationError } from "./refunds.ts";

// A vendor_order past this point already finished its own lifecycle -
// nothing left for a cancellation to do or undo.
export const BLOCKED_VENDOR_ORDER_STATUSES = ["delivered", "cancelled", "returned"];

export interface CancelOneVendorOrderParams {
  vendorOrder: { id: string; status: string; subtotal: number; shipping_cost: number };
  order: { id: string; payment_method: string; payment_status: string };
  cancelledBy: string;
  reason: string;
}

export interface CancelOneVendorOrderResult {
  vendorOrderId: string;
  cancelled: boolean;
  skippedReason: string | null;
  refundId: string | null;
  refundError: string | null;
  wasAlreadyShipped: boolean;
  cancellationId: string | null;
}

// The actual "cancel one vendor's shipment" primitive - shared by
// cancel-order-items whether it's asked to cancel one shipment, several,
// or every shipment in the order ("cancel the whole order" is just this
// called once per still-cancellable shipment). Never touches the parent
// orders.order_status - callers recompute that once after their whole
// batch, not per call, since a batch of several calls would otherwise
// each redundantly re-check every sibling.
export async function cancelOneVendorOrder(
  supabase: SupabaseClient,
  params: CancelOneVendorOrderParams,
): Promise<CancelOneVendorOrderResult> {
  const { vendorOrder, order, cancelledBy, reason } = params;

  if (BLOCKED_VENDOR_ORDER_STATUSES.includes(vendorOrder.status)) {
    return {
      vendorOrderId: vendorOrder.id,
      cancelled: false,
      skippedReason: `already ${vendorOrder.status}`,
      refundId: null,
      refundError: null,
      wasAlreadyShipped: false,
      cancellationId: null,
    };
  }

  // Best-effort: "already picked up" is handled inside cancelShiprocketShipment
  // and isn't an error, but anything else it throws (transient API error,
  // expired token) must not block what's actually owed to the customer -
  // their cancellation and refund. Logged, not fatal.
  let wasAlreadyShipped = false;
  try {
    const shipResult = await cancelShiprocketShipment(supabase, vendorOrder.id);
    wasAlreadyShipped = shipResult.alreadyPickedUp;
  } catch (e) {
    console.error("cancelOneVendorOrder: Shiprocket cancel failed, proceeding anyway", errorMessage(e));
  }

  const { error: updateVoErr } = await supabase
    .from("vendor_orders")
    .update({ status: "cancelled" })
    .eq("id", vendorOrder.id);
  if (updateVoErr) throw updateVoErr;

  // subtotal + shipping_cost is what the customer actually paid for this
  // shipment - net_payable is the vendor's post-commission payout figure
  // and would under-refund the customer.
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
        initiatedBy: cancelledBy,
      });
      refundId = result.refundId;
    } catch (e) {
      // Must not undo the cancellation already applied above. Surfaced to
      // the caller instead so it can tell a human, rather than being
      // silently lost in function logs nobody watches.
      refundError = e instanceof RefundValidationError ? e.message : errorMessage(e);
      console.error("cancelOneVendorOrder: refund failed", refundError);
    }
  }

  const { data: cancellationRow, error: insertErr } = await supabase
    .from("order_cancellations")
    .insert({
      order_id: order.id,
      vendor_order_id: vendorOrder.id,
      cancelled_by: cancelledBy,
      reason,
      was_already_shipped: wasAlreadyShipped,
      refund_id: refundId,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  return {
    vendorOrderId: vendorOrder.id,
    cancelled: true,
    skippedReason: null,
    refundId,
    refundError,
    wasAlreadyShipped,
    cancellationId: cancellationRow.id,
  };
}
