import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
