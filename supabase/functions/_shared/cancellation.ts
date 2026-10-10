import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { errorMessage } from "./auth.ts";
import { cancelShiprocketShipment } from "./shiprocket.ts";
import { executeRefund, RefundValidationError } from "./refunds.ts";
import { links, notifyAllAdmins, notifyVendorMembers } from "./notify.ts";

// A vendor_order past this point already finished its own lifecycle -
// nothing left for a cancellation to do or undo.
export const BLOCKED_VENDOR_ORDER_STATUSES = ["delivered", "cancelled", "returned"];

// order_items.variant_id is an unconstrained TEXT column - a no-variant line
// item carries a synthetic id like `${productId}-default`, not a uuid.
// Same check Checkout.tsx applies before its own adjust_stock call.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CancelOneVendorOrderParams {
  vendorOrder: { id: string; status: string; subtotal: number; shipping_cost: number };
  order: { id: string; payment_method: string; payment_status: string };
  cancelledBy: string;
  reason: string;
  // Warehouse decisions (an item failing inspection, an undelivered parcel
  // the admin cancels) cancel boutique orders past the normal cut-off and
  // record their own send-back to the boutique.
  force?: boolean;
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
  const { vendorOrder, order, cancelledBy, reason, force = false } = params;
  const skip = (skippedReason: string): CancelOneVendorOrderResult => ({
    vendorOrderId: vendorOrder.id,
    cancelled: false,
    skippedReason,
    refundId: null,
    refundError: null,
    wasAlreadyShipped: false,
    cancellationId: null,
  });

  if (vendorOrder.status === "cancelled" || (!force && BLOCKED_VENDOR_ORDER_STATUSES.includes(vendorOrder.status))) {
    return skip(`already ${vendorOrder.status}`);
  }

  // Warehouse route: once the warehouse's parcel is booked, this part is on
  // its way to the customer with the rest - it can only come back as a
  // return. Still being packed: take it out of the parcel.
  const { data: warehouseState } = await supabase
    .from("vendor_orders")
    .select("dispatch_id, received_at_warehouse_at, dispatch:warehouse_dispatches(id, status)")
    .eq("id", vendorOrder.id)
    .maybeSingle();
  const dispatch = (warehouseState as any)?.dispatch as { id: string; status: string } | null;
  if (dispatch && !force) {
    if (dispatch.status !== "packing") return skip("already packed and shipped from our warehouse");
    await supabase.from("vendor_orders").update({ dispatch_id: null }).eq("id", vendorOrder.id);
    const { count } = await supabase
      .from("vendor_orders")
      .select("id", { count: "exact", head: true })
      .eq("dispatch_id", dispatch.id);
    if (!count) await supabase.from("warehouse_dispatches").update({ status: "cancelled" }).eq("id", dispatch.id);
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
    // The customer's cancellation still goes through, but a live courier
    // booking must not be left behind silently - tell the people who can
    // cancel it in Shiprocket by hand, and record why on the shipment.
    const msg = errorMessage(e);
    console.error("cancelOneVendorOrder: Shiprocket cancel failed, proceeding anyway", msg);
    const { data: vo } = await supabase.from("vendor_orders").select("vendor_id, order_id").eq("id", vendorOrder.id).maybeSingle();
    await supabase
      .from("shipments")
      .update({ status_raw: `Order cancelled but Shiprocket cancellation failed: ${msg}` })
      .eq("vendor_order_id", vendorOrder.id)
      .in("shipment_type", ["forward", "to_warehouse"])
      .is("return_request_id", null);
    const ref = `#${String(vo?.order_id ?? order.id).slice(0, 8)}`;
    const n = {
      type: "shipment_cancel_failed",
      title: "Cancel this shipment in Shiprocket",
      body: `Order ${ref} was cancelled, but Shiprocket refused to cancel its courier booking (${msg}). Please cancel it in the Shiprocket panel so the courier doesn't pick it up.`,
    };
    if (vo?.vendor_id) await notifyVendorMembers(supabase, vo.vendor_id, { ...n, link: links.vendorOrder(vendorOrder.id) });
    await notifyAllAdmins(supabase, { ...n, link: links.adminOrder(vendorOrder.id) });
  }

  const { error: updateVoErr } = await supabase
    .from("vendor_orders")
    .update({ status: "cancelled" })
    .eq("id", vendorOrder.id);
  if (updateVoErr) throw updateVoErr;

  // Stock only comes back if the vendor never actually sent it out - an
  // already-shipped item is only restored on a genuine RTO, handled
  // separately via the courier webhook, not here. Best-effort: a stock-sync
  // problem must not block the cancellation/refund the customer is owed.
  if (!wasAlreadyShipped) {
    const { data: cancelledItems, error: itemsErr } = await supabase
      .from("order_items")
      .select("product_id, variant_id, quantity")
      .eq("vendor_order_id", vendorOrder.id);
    if (itemsErr) {
      console.error("cancelOneVendorOrder: failed to fetch order_items for stock restore", errorMessage(itemsErr));
    } else {
      for (const item of cancelledItems ?? []) {
        const variantId = UUID_RE.test(item.variant_id) ? item.variant_id : null;
        const { error: stockErr } = await supabase.rpc("adjust_stock", {
          _product_id: item.product_id,
          _variant_id: variantId,
          _delta: item.quantity,
          _movement_type: "return",
          _reason: `Order cancelled: ${reason}`,
          _reference_order_id: order.id,
        });
        if (stockErr) {
          console.error("cancelOneVendorOrder: stock restore failed for product", item.product_id, errorMessage(stockErr));
        }
      }
    }
  }

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
        vendorOrderId: vendorOrder.id,
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

  // Already at the warehouse: it goes back to the boutique. (One still on its
  // way gets its send-back when the warehouse receives it.)
  if (!force && warehouseState?.received_at_warehouse_at) {
    const { error: sendBackErr } = await supabase.rpc("create_boutique_send_back", {
      _vendor_order_id: vendorOrder.id,
      _reason: "order_cancelled",
      _notes: reason,
    });
    if (sendBackErr) console.error("cancelOneVendorOrder: send-back not recorded", errorMessage(sendBackErr));
  }

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
