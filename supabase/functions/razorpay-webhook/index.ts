import { corsHeaders, jsonResponse, serviceClient, errorMessage } from "../_shared/auth.ts";
import { reconcileRefundTotals } from "../_shared/refunds.ts";
import { createHeldTransfers, notifyAdmins, notifyVendor, reconcileSettlements, VENDOR_STATUS_FOR } from "../_shared/razorpayRoute.ts";

// Public endpoint - Razorpay's own servers call this, not our frontend
// (verify_jwt = false in supabase/config.toml, same exception pattern as
// courier-tracking-webhook). Authenticity is the HMAC-SHA256 signature Razorpay
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

const DISPUTE_STATUS_BY_EVENT: Record<string, string> = {
  "payment.dispute.created": "open",
  "payment.dispute.won": "won",
  "payment.dispute.lost": "lost",
  "payment.dispute.closed": "closed",
};

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
    const event: string = payload.event;
    const supabase = serviceClient();

    const paymentEntity = payload.payload?.payment?.entity;
    const refundEntity = payload.payload?.refund?.entity;
    const orderEntity = payload.payload?.order?.entity;
    const disputeEntity = payload.payload?.dispute?.entity;
    const settlementEntity = payload.payload?.settlement?.entity;

    // Shared across every branch below - most Razorpay events (payment,
    // order, refund, dispute) carry a payment entity, so resolving our
    // internal payment_id/order_id once here means every branch's
    // payment_events row gets the same linkage without repeating the
    // lookup. Settlement events have no payment entity - stay unresolved,
    // which is correct (a settlement batches many orders, not one).
    let resolvedPaymentId: string | null = null;
    let resolvedOrderId: string | null = null;
    if (paymentEntity?.id) {
      const { data: p } = await supabase
        .from("payments")
        .select("id, order_id")
        .eq("transaction_id", paymentEntity.id)
        .maybeSingle();
      if (p) {
        resolvedPaymentId = p.id;
        resolvedOrderId = p.order_id;
      }
    }
    if (!resolvedOrderId && orderEntity?.id) {
      const { data: o } = await supabase
        .from("orders")
        .select("id")
        .eq("razorpay_order_id", orderEntity.id)
        .maybeSingle();
      if (o) resolvedOrderId = o.id;
    }

    // Complete raw feed of every event this endpoint has ever received,
    // regardless of whether it also got structured handling below -
    // mirrors shipment_events' role as the audit trail of record. A
    // duplicate delivery of the same event (Razorpay retries on non-2xx)
    // hits the partial unique index and is silently ignored, not an error.
    const logEvent = async (entityId?: string | null) => {
      const { error } = await supabase.from("payment_events").insert({
        event_type: event,
        razorpay_entity_id: entityId ?? null,
        payment_id: resolvedPaymentId,
        order_id: resolvedOrderId,
        raw_payload: payload,
      });
      if (error && error.code !== "23505") throw error;
    };

    switch (event) {
      case "payment.captured":
      case "payment.failed": {
        // Safety net, not the primary path - verify-razorpay-payment
        // (the client-side flow) already does this on every normal
        // checkout. This only matters when that call never fired (browser
        // closed right after paying) - the order would otherwise stay
        // "pending" forever despite Razorpay actually holding the money.
        // Guarded to only ever transition FROM 'pending', so a late/
        // out-of-order failed event can never downgrade an already-paid
        // order, and an already-reconciled order is never touched twice.
        if (paymentEntity?.id && paymentEntity?.order_id) {
          const newStatus = event === "payment.captured" ? "paid" : "failed";
          const { data: order } = await supabase
            .from("orders")
            .select("id, payment_status")
            .eq("razorpay_order_id", paymentEntity.order_id)
            .maybeSingle();
          if (order?.payment_status === "pending") {
            await supabase
              .from("orders")
              .update({ payment_status: newStatus, razorpay_payment_id: paymentEntity.id })
              .eq("id", order.id)
              .eq("payment_status", "pending");
            await supabase
              .from("payments")
              .update({
                payment_status: newStatus,
                transaction_id: paymentEntity.id,
                gateway_fee: typeof paymentEntity.fee === "number" ? paymentEntity.fee / 100 : null,
                gateway_tax: typeof paymentEntity.tax === "number" ? paymentEntity.tax / 100 : null,
              })
              .eq("order_id", order.id)
              .eq("payment_status", "pending");
            resolvedOrderId = order.id;
            if (newStatus === "paid") {
              await createHeldTransfers(supabase, order.id, paymentEntity.id).catch((e) =>
                console.error("createHeldTransfers (webhook) error", e),
              );
            }
          }
        }
        await logEvent(paymentEntity?.id);
        break;
      }

      case "transfer.processed":
      case "transfer.failed": {
        const transferEntity = payload.payload?.transfer?.entity;
        if (event === "transfer.failed" && transferEntity?.id) {
          const reason = transferEntity.error?.description ?? transferEntity.error?.reason ?? "Transfer failed at Razorpay";
          const { data: vo } = await supabase
            .from("vendor_orders")
            .update({ rzp_transfer_status: "failed", rzp_transfer_error: reason })
            .eq("rzp_transfer_id", transferEntity.id)
            .select("id, order_id, vendor_id, net_payable")
            .maybeSingle();
          if (vo) {
            const ref = `#${String(vo.order_id).slice(0, 8)}`;
            await notifyAdmins(supabase, "payout_transfer_failed", "Razorpay payout failed", `Order ${ref}: ${reason}. It will be retried in the next daily payout run.`);
            await notifyVendor(
              supabase,
              vo.vendor_id,
              "payout_failed",
              "Payout delayed",
              `Razorpay couldn't complete the payout of ₹${Math.round(Number(vo.net_payable))} for order ${ref} (${reason}). We'll retry automatically.`,
              { event: "transfer_failed", vendor_order_ids: [vo.id], reason },
            );
          }
        }
        await logEvent(transferEntity?.id);
        break;
      }

      case "product.route.activated":
      case "product.route.under_review":
      case "product.route.needs_clarification": {
        // account_id is the boutique's linked account; this is Razorpay's
        // verdict on its bank account / KYC.
        const linkedAccountId: string | undefined = payload.account_id;
        const status = event.replace("product.route.", "");
        const requirements =
          payload.payload?.merchant_product?.data?.requirements ??
          payload.payload?.merchant_product?.entity?.requirements ??
          null;
        if (linkedAccountId) {
          const { data: acct } = await supabase
            .from("vendor_payout_accounts")
            .update({ razorpay_status: status, razorpay_requirements: requirements, razorpay_synced_at: new Date().toISOString() })
            .eq("razorpay_account_id", linkedAccountId)
            .select("vendor_id")
            .maybeSingle();
          if (acct) {
            await supabase.from("vendors").update({ payout_account_status: VENDOR_STATUS_FOR[status] ?? "pending" }).eq("id", acct.vendor_id);
            if (status === "activated") {
              await notifyVendor(supabase, acct.vendor_id, "payout_account_verified", "Bank account verified",
                "Razorpay verified your bank account - your payouts will now be sent automatically.",
                { event: "account_activated" });
            } else if (status === "needs_clarification") {
              const why = Array.isArray(requirements)
                ? requirements.map((r: any) => r.description ?? r.reason_code).filter(Boolean).join("; ")
                : "";
              await notifyVendor(supabase, acct.vendor_id, "payout_account_rejected", "Bank details need attention",
                `Razorpay couldn't verify your payout details${why ? `: ${why}` : ""}. Please correct them in your Payouts tab.`,
                { event: "account_needs_clarification", reason: why });
            }
          }
        }
        await logEvent(linkedAccountId);
        break;
      }

      case "order.paid": {
        // Audit trail only - redundant with payment.captured for this
        // app's one-payment-per-order checkout, so no separate
        // reconciliation logic here (would just be the same write twice).
        await logEvent(orderEntity?.id ?? paymentEntity?.id);
        break;
      }

      case "refund.created": {
        // Audit trail only - refund.processed/refund.failed below already
        // do the real reconciliation once Razorpay resolves the refund.
        await logEvent(refundEntity?.id);
        break;
      }

      case "refund.processed":
      case "refund.failed": {
        if (!refundEntity?.id) {
          await logEvent(undefined);
          break;
        }

        const newStatus = event === "refund.processed" ? "processed" : "failed";
        const gatewayProcessedAt = refundEntity.processed_at
          ? new Date(refundEntity.processed_at * 1000).toISOString()
          : newStatus === "processed"
            ? new Date().toISOString()
            : null;
        const failureReason =
          newStatus === "failed"
            ? refundEntity.notes?.reason || refundEntity.error_description || "Refund failed at gateway"
            : null;

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
        } else if (resolvedPaymentId && resolvedOrderId) {
          // No matching row - this refund was issued directly from
          // Razorpay's dashboard, bypassing this app entirely. Record it
          // now instead of leaving it permanently invisible (the gap that
          // caused the original "cancelled from the dashboard but no
          // update anywhere" report for shipments - same class of bug,
          // fixed here for refunds up front).
          const { data: inserted, error: insertErr } = await supabase
            .from("refunds")
            .insert({
              order_id: resolvedOrderId,
              payment_id: resolvedPaymentId,
              initiated_by: null,
              amount: (refundEntity.amount ?? 0) / 100,
              reason: "Issued directly in Razorpay dashboard",
              status: newStatus,
              razorpay_refund_id: refundEntity.id,
              razorpay_payment_id: paymentEntity?.id ?? "",
              speed: refundEntity.speed_processed === "instant" ? "instant" : "normal",
              failure_reason: failureReason,
              gateway_processed_at: gatewayProcessedAt,
            })
            .select("id, payment_id")
            .single();
          if (insertErr) throw insertErr;
          paymentIdToReconcile = inserted.payment_id;
        }

        if (paymentIdToReconcile) await reconcileRefundTotals(supabase, paymentIdToReconcile);
        await logEvent(refundEntity.id);
        break;
      }

      case "payment.dispute.created":
      case "payment.dispute.won":
      case "payment.dispute.lost":
      case "payment.dispute.closed": {
        if (disputeEntity?.id) {
          const { error: disputeErr } = await supabase.from("disputes").upsert(
            {
              razorpay_dispute_id: disputeEntity.id,
              payment_id: resolvedPaymentId,
              order_id: resolvedOrderId,
              amount: (disputeEntity.amount ?? 0) / 100,
              reason_code: disputeEntity.reason_code ?? null,
              status: DISPUTE_STATUS_BY_EVENT[event] ?? "open",
              respond_by: disputeEntity.respond_by
                ? new Date(disputeEntity.respond_by * 1000).toISOString()
                : null,
            },
            { onConflict: "razorpay_dispute_id" },
          );
          if (disputeErr) throw disputeErr;
        }
        await logEvent(disputeEntity?.id);
        break;
      }

      case "settlement.processed": {
        // A boutique's linked account settling to its bank: mark those
        // payouts credited (with the UTR) and tell the boutique.
        const settlementAccountId: string | undefined = payload.account_id;
        if (settlementAccountId && settlementEntity?.id) {
          const { data: linked } = await supabase
            .from("vendor_payout_accounts")
            .select("vendor_id")
            .eq("razorpay_account_id", settlementAccountId)
            .maybeSingle();
          if (linked) {
            await reconcileSettlements(supabase, settlementEntity.id, settlementEntity.utr ?? null, settlementAccountId);
            await logEvent(settlementEntity.id);
            break;
          }
        }
        // Platform's own settlement - batches many orders, so no
        // payment/order link here.
        if (settlementEntity?.id) {
          const { error: settlementErr } = await supabase.from("settlements").upsert(
            {
              razorpay_settlement_id: settlementEntity.id,
              amount: (settlementEntity.amount ?? 0) / 100,
              fees: typeof settlementEntity.fees === "number" ? settlementEntity.fees / 100 : null,
              tax: typeof settlementEntity.tax === "number" ? settlementEntity.tax / 100 : null,
              utr: settlementEntity.utr ?? null,
              settled_at: settlementEntity.created_at
                ? new Date(settlementEntity.created_at * 1000).toISOString()
                : new Date().toISOString(),
            },
            { onConflict: "razorpay_settlement_id" },
          );
          if (settlementErr) throw settlementErr;
        }
        await logEvent(settlementEntity?.id);
        break;
      }

      default:
        // Razorpay adds new event types over time - an unrecognized one
        // must never fail the endpoint, just go straight to the raw log.
        await logEvent(paymentEntity?.id ?? refundEntity?.id ?? disputeEntity?.id ?? settlementEntity?.id);
        return jsonResponse({ received: true, ignored: event });
    }

    return jsonResponse({ received: true });
  } catch (e) {
    console.error("razorpay-webhook error", e);
    // Non-2xx makes Razorpay retry, which is correct for a genuine
    // processing failure (matches courier-tracking-webhook's same convention).
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
