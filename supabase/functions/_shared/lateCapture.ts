import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { errorMessage } from "./auth.ts";
import { executeRefund } from "./refunds.ts";
import { notifyAdmins } from "./razorpayRoute.ts";
import { links, notifyUsers } from "./notify.ts";
import { money } from "./money.ts";

// A payment Razorpay captured for a checkout that was already released as
// unpaid (abandon_checkout: cancelled, stock and wallet put back). There is
// no order to fulfil, so the money goes back in full, automatically, and
// the admins and the customer are told (client corrections, 15 Nov 2026,
// 2.9 point 1). The order stays cancelled and its boutiques are never told.
//
// Called by razorpay-webhook (payment.captured) and verify-razorpay-payment.
// Only the call that moves the order from unpaid to paid goes on to refund,
// so the two can never refund it twice. Never throws once that move is
// made: a webhook retry would find the order already paid and skip it, so
// a failure here must end in an admin alert, not an error.

export interface CapturedPayment {
  id: string;
  // Paise, as Razorpay reports it.
  amount: number;
  fee?: number | null;
  tax?: number | null;
}

export type LateCaptureOutcome = "refunded" | "refund_failed" | "already_handled";

export async function refundLateCapture(
  supabase: SupabaseClient,
  orderId: string,
  payment: CapturedPayment,
): Promise<LateCaptureOutcome> {
  const { data: claimed, error: claimErr } = await supabase
    .from("orders")
    .update({ payment_status: "paid", razorpay_payment_id: payment.id })
    .eq("id", orderId)
    .eq("order_status", "cancelled")
    .in("payment_status", ["pending", "failed"])
    .select("id, user_id")
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) return "already_handled";

  const ref = `#${orderId.slice(0, 8)}`;
  const amount = Math.round(Number(payment.amount)) / 100;
  try {
    const { error: paymentErr } = await supabase
      .from("payments")
      .update({
        payment_status: "paid",
        transaction_id: payment.id,
        gateway_fee: typeof payment.fee === "number" ? payment.fee / 100 : null,
        gateway_tax: typeof payment.tax === "number" ? payment.tax / 100 : null,
      })
      .eq("order_id", orderId)
      .in("payment_status", ["pending", "failed"]);
    if (paymentErr) throw paymentErr;

    await executeRefund(supabase, {
      orderId,
      amount,
      reason: "Paid after the checkout was released as unpaid - refunded automatically",
      initiatedBy: null,
      speed: "normal",
    });
  } catch (e) {
    console.error("refundLateCapture: refund failed", orderId, errorMessage(e));
    await notifyAdmins(
      supabase,
      "late_payment_refund",
      "Payment received for a released checkout - refund it",
      `Order ${ref} was released as unpaid, then Razorpay captured ${money(amount)} for it. The automatic refund failed (${errorMessage(e)}) - refund it from Payments.`,
      "/admin?tab=payments",
    );
    return "refund_failed";
  }

  await notifyAdmins(
    supabase,
    "late_payment_refunded",
    "Late payment refunded automatically",
    `Order ${ref} was released as unpaid, then Razorpay captured ${money(amount)} for it. No order was placed, so it was refunded in full automatically.`,
    "/admin?tab=payments",
  );
  if (claimed.user_id) {
    await notifyUsers(supabase, [claimed.user_id], {
      type: "late_payment_refunded",
      title: "Payment refunded",
      body: `Your payment of ${money(amount)} came through after the checkout had timed out, so no order was placed. It is being refunded to your original payment method (usually 5-7 working days).`,
      link: links.customerOrder(orderId),
    });
  }
  return "refunded";
}
