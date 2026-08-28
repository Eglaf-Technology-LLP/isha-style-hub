import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { AppError, errorMessage } from "./auth.ts";

// Thrown for anything wrong with the request itself (no payment, wrong
// status, amount exceeds what's left) - before executeRefund ever touches
// Razorpay. Callers map this to 400; anything else thrown (AppError from
// the gateway call, or a plain DB error) is a real failure worth a 5xx.
export class RefundValidationError extends Error {}

// Single source of truth for "how much of this payment is actually
// refunded" - both create-razorpay-refund (right after Razorpay responds)
// and razorpay-webhook (once Razorpay confirms async, possibly days later)
// call this so the two paths can never disagree about
// payments/orders.payment_status. Only status='processed' counts toward
// the total - a merely 'initiated'/'processing' refund hasn't actually
// moved money yet, so it doesn't get reflected as refunded.
export async function reconcileRefundTotals(supabase: SupabaseClient, paymentId: string): Promise<void> {
  const { data: payment, error: paymentErr } = await supabase
    .from("payments")
    .select("id, order_id, amount")
    .eq("id", paymentId)
    .single();
  if (paymentErr) throw paymentErr;

  const { data: processedRefunds, error: refundsErr } = await supabase
    .from("refunds")
    .select("amount")
    .eq("payment_id", paymentId)
    .eq("status", "processed");
  if (refundsErr) throw refundsErr;

  const processedSum = (processedRefunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const newPaymentStatus =
    processedSum >= payment.amount ? "refunded" : processedSum > 0 ? "partially_refunded" : "paid";

  const { error: updatePaymentErr } = await supabase
    .from("payments")
    .update({ refund_amount: processedSum, payment_status: newPaymentStatus })
    .eq("id", paymentId);
  if (updatePaymentErr) throw updatePaymentErr;

  // orders.payment_status has no 'partially_refunded' value in its check
  // constraint - only flip it once the whole payment is refunded, leave it
  // alone otherwise (matches the old DB-only processRefund()'s behavior
  // for the order-level flag).
  if (newPaymentStatus === "refunded") {
    const { error: updateOrderErr } = await supabase
      .from("orders")
      .update({ payment_status: "refunded" })
      .eq("id", payment.order_id);
    if (updateOrderErr) throw updateOrderErr;
  }
}

export interface ExecuteRefundParams {
  orderId: string;
  amount: number;
  reason: string;
  // null = system-initiated (no human triggered this specific call) -
  // cancel-vendor-order always passes the real caller, but the shape
  // stays nullable for any future non-human-initiated caller.
  initiatedBy: string | null;
  speed?: "instant" | "normal";
  returnRequestId?: string | null;
}

export interface ExecuteRefundResult {
  refundId: string;
  razorpayRefundId: string | null;
  status: "processing" | "processed";
}

// The actual "move money via Razorpay" primitive, extracted from
// create-razorpay-refund so cancel-vendor-order can call the same code
// instead of a second copy. Deliberately has NO authorization check of
// its own - each caller (create-razorpay-refund: admin-only;
// cancel-vendor-order: order-owner-or-admin) enforces its own boundary
// before calling this, and this function is never exposed directly over
// HTTP. Throws on any failure - callers translate to their own response.
export async function executeRefund(
  supabase: SupabaseClient,
  params: ExecuteRefundParams,
): Promise<ExecuteRefundResult> {
  const { orderId, amount, reason, initiatedBy, returnRequestId } = params;
  const refundSpeed = params.speed === "instant" ? "instant" : "normal";

  // One Razorpay payment covers a whole multi-vendor cart - there's no
  // per-vendor payments row to resolve here, this targets the order's
  // single payment record (verify-razorpay-payment writes it the same
  // way, by order_id, not payment_id).
  const { data: payment, error: paymentErr } = await supabase
    .from("payments")
    .select("id, order_id, amount, payment_status, transaction_id, refund_amount")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentErr) throw paymentErr;
  if (!payment) throw new RefundValidationError("No payment found for this order");
  if (!payment.transaction_id) {
    throw new RefundValidationError("This payment has no gateway transaction id - it may not have been paid via Razorpay");
  }
  if (payment.payment_status !== "paid" && payment.payment_status !== "partially_refunded") {
    throw new RefundValidationError(`Payment is '${payment.payment_status}' - only a paid or partially refunded payment can be refunded`);
  }

  // Committed = anything not yet known to have failed - covers a refund
  // still in flight (initiated/processing) as well as ones already
  // processed, so two refund attempts submitted back-to-back (e.g. a
  // return refund racing a cancellation on the same order) can't together
  // exceed what was actually paid.
  const { data: committedRefunds, error: refundsErr } = await supabase
    .from("refunds")
    .select("amount")
    .eq("payment_id", payment.id)
    .in("status", ["initiated", "processing", "processed"]);
  if (refundsErr) throw refundsErr;

  const alreadyCommitted = (committedRefunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const remaining = payment.amount - alreadyCommitted;
  if (amount > remaining) {
    throw new RefundValidationError(`Refund amount exceeds what's left refundable (₹${remaining.toFixed(2)} remaining)`);
  }

  const { data: refundRow, error: insertErr } = await supabase
    .from("refunds")
    .insert({
      order_id: orderId,
      payment_id: payment.id,
      return_request_id: returnRequestId ?? null,
      initiated_by: initiatedBy,
      amount,
      reason,
      status: "initiated",
      razorpay_payment_id: payment.transaction_id,
      speed: refundSpeed,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
  const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
  }
  const basicAuth = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

  let rzpBody: any;
  try {
    const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${payment.transaction_id}/refund`, {
      method: "POST",
      headers: { Authorization: basicAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        speed: refundSpeed,
        notes: { reason },
      }),
    });
    rzpBody = await rzpRes.json().catch(() => ({}));
    if (!rzpRes.ok) {
      console.error("Razorpay refund error", rzpRes.status, rzpBody);
      throw new AppError(rzpRes.status, "Razorpay refund failed", rzpBody);
    }
  } catch (e) {
    await supabase
      .from("refunds")
      .update({ status: "failed", failure_reason: errorMessage(e) })
      .eq("id", refundRow.id);
    throw e;
  }

  const newStatus: "processed" | "processing" = rzpBody.status === "processed" ? "processed" : "processing";
  const { error: updateErr } = await supabase
    .from("refunds")
    .update({
      razorpay_refund_id: rzpBody.id,
      status: newStatus,
      gateway_processed_at: newStatus === "processed" ? new Date().toISOString() : null,
    })
    .eq("id", refundRow.id);
  if (updateErr) throw updateErr;

  await reconcileRefundTotals(supabase, payment.id);

  return { refundId: refundRow.id, razorpayRefundId: rzpBody.id ?? null, status: newStatus };
}
