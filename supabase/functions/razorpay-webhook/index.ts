import { corsHeaders, jsonResponse, serviceClient, errorMessage } from "../_shared/auth.ts";
import { reconcileRefundTotals } from "../_shared/refunds.ts";

// Public endpoint - Razorpay's own servers call this, not our frontend
// (verify_jwt = false in supabase/config.toml, same exception pattern as
// shiprocket-webhook). Authenticity is the HMAC-SHA256 signature Razorpay
// computes over the raw request body with a webhook secret only it and
// this function know - configured in Razorpay's dashboard (Settings ->
// Webhooks), not something settable via their API.
async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computed = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Signature is over the exact raw bytes Razorpay sent - must read as
  // text before any JSON parsing, or the recomputed HMAC won't match.
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

  if (!secret || !signature || !(await verifySignature(rawBody, signature, secret))) {
    console.error("razorpay-webhook: missing/invalid signature");
    // 400, not 500 - a bad signature will never become valid on retry.
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  try {
    const payload = JSON.parse(rawBody);
    const event = payload.event;
    if (event !== "refund.processed" && event !== "refund.failed") {
      return jsonResponse({ received: true, ignored: event });
    }

    const refundEntity = payload.payload?.refund?.entity;
    const paymentEntity = payload.payload?.payment?.entity;
    if (!refundEntity?.id) return jsonResponse({ received: true, ignored: "no refund entity in payload" });

    const supabase = serviceClient();
    const newStatus = event === "refund.processed" ? "processed" : "failed";
    const gatewayProcessedAt = refundEntity.processed_at
      ? new Date(refundEntity.processed_at * 1000).toISOString()
      : newStatus === "processed"
        ? new Date().toISOString()
        : null;
    const failureReason =
      newStatus === "failed" ? refundEntity.notes?.reason || refundEntity.error_description || "Refund failed at gateway" : null;

    const { data: existing } = await supabase
      .from("refunds")
      .select("id, payment_id")
      .eq("razorpay_refund_id", refundEntity.id)
      .maybeSingle();

    let paymentIdToReconcile: string | null = null;

    if (existing) {
      const { error: updateErr } = await supabase
        .from("refunds")
        .update({ status: newStatus, gateway_processed_at: gatewayProcessedAt, failure_reason: failureReason })
        .eq("id", existing.id);
      if (updateErr) throw updateErr;
      paymentIdToReconcile = existing.payment_id;
    } else if (paymentEntity?.id) {
      // No matching row - this refund was issued directly from Razorpay's
      // dashboard, bypassing this app entirely. Record it now instead of
      // leaving it permanently invisible (the gap that caused the original
      // "cancelled from the dashboard but no update anywhere" report for
      // shipments - same class of bug, fixed here for refunds up front).
      const { data: payment } = await supabase
        .from("payments")
        .select("id, order_id")
        .eq("transaction_id", paymentEntity.id)
        .maybeSingle();

      if (payment) {
        const { data: inserted, error: insertErr } = await supabase
          .from("refunds")
          .insert({
            order_id: payment.order_id,
            payment_id: payment.id,
            initiated_by: null,
            amount: (refundEntity.amount ?? 0) / 100,
            reason: "Issued directly in Razorpay dashboard",
            status: newStatus,
            razorpay_refund_id: refundEntity.id,
            razorpay_payment_id: paymentEntity.id,
            speed: refundEntity.speed_processed === "instant" ? "instant" : "normal",
            failure_reason: failureReason,
            gateway_processed_at: gatewayProcessedAt,
          })
          .select("id, payment_id")
          .single();
        if (insertErr) throw insertErr;
        paymentIdToReconcile = inserted.payment_id;
      } else {
        console.error("razorpay-webhook: no matching payment for razorpay payment id", paymentEntity.id);
        return jsonResponse({ received: true, matched: false });
      }
    } else {
      return jsonResponse({ received: true, matched: false });
    }

    if (paymentIdToReconcile) await reconcileRefundTotals(supabase, paymentIdToReconcile);

    return jsonResponse({ received: true, matched: true });
  } catch (e) {
    console.error("razorpay-webhook error", e);
    // Non-2xx makes Razorpay retry, which is correct for a genuine
    // processing failure (matches shiprocket-webhook's same convention).
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
