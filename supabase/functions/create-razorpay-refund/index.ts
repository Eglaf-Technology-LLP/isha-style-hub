import { AppError, corsHeaders, jsonResponse, serviceClient, getCallerUserId, isAdmin, errorMessage } from "../_shared/auth.ts";
import { reconcileRefundTotals } from "../_shared/refunds.ts";

// Admin-only, by design: this is the only place in the app that actually
// moves money back to a customer. The old "Process Refund" button only
// wrote payments.refund_amount / orders.payment_status - a real, live bug
// where staff believed a customer had been repaid when no gateway call
// had ever been made. This function is the fix: it calls Razorpay's real
// refund API and records every attempt (success or failure) in `refunds`
// before returning, so there's always an audit trail even when the
// gateway call itself fails.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id, amount, reason, speed, return_request_id } = await req.json();
    if (!order_id) return jsonResponse({ error: "order_id is required" }, 400);
    const refundAmount = Number(amount);
    if (!refundAmount || refundAmount <= 0) {
      return jsonResponse({ error: "A positive amount is required" }, 400);
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return jsonResponse({ error: "A reason is required" }, 400);
    }
    const refundSpeed = speed === "instant" ? "instant" : "normal";

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    if (!(await isAdmin(supabase, userId))) return jsonResponse({ error: "Forbidden" }, 403);

    // One Razorpay payment covers a whole multi-vendor cart - there's no
    // per-vendor split to resolve here, this targets the order's single
    // payment record (verify-razorpay-payment writes it the same way, by
    // order_id, not payment_id).
    const { data: payment, error: paymentErr } = await supabase
      .from("payments")
      .select("id, order_id, amount, payment_status, transaction_id, refund_amount")
      .eq("order_id", order_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentErr) throw paymentErr;
    if (!payment) return jsonResponse({ error: "No payment found for this order" }, 404);
    if (!payment.transaction_id) {
      return jsonResponse({ error: "This payment has no gateway transaction id - it may not have been paid via Razorpay" }, 400);
    }
    if (payment.payment_status !== "paid" && payment.payment_status !== "partially_refunded") {
      return jsonResponse({ error: `Payment is '${payment.payment_status}' - only a paid or partially refunded payment can be refunded` }, 400);
    }

    // Committed = anything not yet known to have failed - covers a refund
    // still in flight (initiated/processing) as well as ones already
    // processed, so two refund attempts submitted back-to-back can't
    // together exceed what was actually paid.
    const { data: committedRefunds, error: refundsErr } = await supabase
      .from("refunds")
      .select("amount")
      .eq("payment_id", payment.id)
      .in("status", ["initiated", "processing", "processed"]);
    if (refundsErr) throw refundsErr;

    const alreadyCommitted = (committedRefunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
    const remaining = payment.amount - alreadyCommitted;
    if (refundAmount > remaining) {
      return jsonResponse(
        { error: `Refund amount exceeds what's left refundable (₹${remaining.toFixed(2)} remaining)` },
        400,
      );
    }

    const { data: refundRow, error: insertErr } = await supabase
      .from("refunds")
      .insert({
        order_id,
        payment_id: payment.id,
        return_request_id: return_request_id ?? null,
        initiated_by: userId,
        amount: refundAmount,
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
          amount: Math.round(refundAmount * 100),
          speed: refundSpeed,
          notes: { reason },
        }),
      });
      rzpBody = await rzpRes.json().catch(() => ({}));
      if (!rzpRes.ok) {
        console.error("Razorpay refund error", rzpRes.status, rzpBody);
        throw new AppError(rzpRes.status, `Razorpay refund failed`, rzpBody);
      }
    } catch (e) {
      await supabase
        .from("refunds")
        .update({ status: "failed", failure_reason: errorMessage(e) })
        .eq("id", refundRow.id);
      return jsonResponse({ error: errorMessage(e) }, 502);
    }

    const newStatus = rzpBody.status === "processed" ? "processed" : "processing";
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

    return jsonResponse({ id: refundRow.id, razorpay_refund_id: rzpBody.id, status: newStatus });
  } catch (e) {
    console.error("create-razorpay-refund error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
