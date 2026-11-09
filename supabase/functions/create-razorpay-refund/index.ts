import { corsHeaders, jsonResponse, serviceClient, getCallerUserId, isAdmin, errorMessage } from "../_shared/auth.ts";
import {
  CHARGE_FREE_RETURN_REASONS,
  executeRefund,
  loadRefundCharge,
  refundChargeOn,
  refundCustomer,
  RefundValidationError,
  returnRefundMethod,
} from "../_shared/refunds.ts";
import { money } from "../_shared/money.ts";

// Admin-only, by design: this is where staff move money back to a
// customer (a return's refund may go to their wallet instead - see below).
// The old "Process Refund" button only
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

    // Defense in depth: the UI already stops a customer selecting a
    // non-returnable item for "Return & Refund", but this is the only
    // place that actually moves money, so it re-derives eligibility from
    // order_items.is_returnable itself rather than trusting that the UI
    // guard was never bypassed (a direct DB edit, a future UI bug, etc).
    if (return_request_id) {
      const { data: returnRequest, error: rrErr } = await supabase
        .from("return_requests")
        .select("items, request_type")
        .eq("id", return_request_id)
        .maybeSingle();
      if (rrErr) throw rrErr;

      if (returnRequest?.request_type === "return") {
        const orderItemIds = ((returnRequest.items as any[]) ?? [])
          .map((i) => i.order_item_id)
          .filter(Boolean);
        if (orderItemIds.length > 0) {
          const { data: eligibleItems, error: oiErr } = await supabase
            .from("order_items")
            .select("id, price, delivery_charge, quantity, is_returnable")
            .in("id", orderItemIds);
          if (oiErr) throw oiErr;

          const eligibleTotal = (eligibleItems ?? [])
            .filter((oi) => oi.is_returnable)
            // A return gives back the goods, not AllBoutiqs' courier.
            .reduce((sum, oi) => sum + (Number(oi.price) - Number(oi.delivery_charge ?? 0)) * oi.quantity, 0);
          if (refundAmount > eligibleTotal) {
            return jsonResponse(
              {
                error: `Refund amount exceeds the refundable value of the selected items (${money(eligibleTotal)}) - one or more selected items may be non-returnable`,
              },
              400,
            );
          }
        }
      }
    }

    try {
      // A return is refunded the way the customer chose: their wallet, or
      // the original payment (whatever the wallet paid goes back to the
      // wallet), less the refund charge unless the fault was the boutique's.
      // The amount is the return's whole refund before that charge -
      // anything already refunded for it (e.g. part of a warehouse refund
      // that went through before another part failed) isn't paid again.
      if (return_request_id) {
        const { data: rr } = await supabase
          .from("return_requests")
          .select("refund_method, reason, refund_fee, refund_fee_gst")
          .eq("id", return_request_id)
          .maybeSingle();
        const { data: order, error: orderErr } = await supabase
          .from("orders")
          .select("payment_method")
          .eq("id", order_id)
          .single();
        if (orderErr) throw orderErr;
        const method = returnRefundMethod(rr ?? {}, order);
        const charge =
          method !== "wallet" && !CHARGE_FREE_RETURN_REASONS.includes(rr?.reason ?? "") ? await loadRefundCharge(supabase) : null;
        // Cash on Delivery by bank transfer: done by hand. Record the charge
        // and say how much to transfer.
        if (method === "bank") {
          const { fee, gst } = refundChargeOn(refundAmount, charge);
          await supabase.from("return_requests").update({ refund_fee: fee, refund_fee_gst: gst }).eq("id", return_request_id);
          return jsonResponse({ bank_transfer: Math.round((refundAmount - fee - gst) * 100) / 100, refund_charge: fee + gst });
        }
        const [{ data: credited }, { data: refunded }] = await Promise.all([
          supabase.from("wallet_transactions").select("amount").eq("return_request_id", return_request_id).eq("kind", "return_refund"),
          supabase.from("refunds").select("amount").eq("return_request_id", return_request_id).in("status", ["initiated", "processing", "processed"]),
        ]);
        const already =
          [...(credited ?? []), ...(refunded ?? [])].reduce((sum, r) => sum + Number(r.amount), 0) +
          Number(rr?.refund_fee ?? 0) +
          Number(rr?.refund_fee_gst ?? 0);
        const due = Math.round((refundAmount - already) * 100) / 100;
        if (due <= 0) {
          return jsonResponse({ id: null, wallet_amount: 0, gateway_amount: 0, already_refunded: already });
        }
        const result = await refundCustomer(supabase, {
          orderId: order_id,
          amount: due,
          method,
          kind: "return_refund",
          sourceKey: `return:${return_request_id}:admin:${already.toFixed(2)}`,
          reason,
          initiatedBy: userId,
          returnRequestId: return_request_id,
          charge,
        });
        if (result.fee + result.feeGst > 0) {
          await supabase
            .from("return_requests")
            .update({
              refund_fee: Math.round((Number(rr?.refund_fee ?? 0) + result.fee) * 100) / 100,
              refund_fee_gst: Math.round((Number(rr?.refund_fee_gst ?? 0) + result.feeGst) * 100) / 100,
            })
            .eq("id", return_request_id);
        }
        return jsonResponse({
          id: result.refundId,
          wallet_amount: result.walletAmount,
          gateway_amount: result.gatewayAmount,
          refund_charge: result.fee + result.feeGst,
        });
      }

      const result = await executeRefund(supabase, {
        orderId: order_id,
        amount: refundAmount,
        reason,
        initiatedBy: userId,
        speed: refundSpeed,
        returnRequestId: return_request_id,
      });
      return jsonResponse({ id: result.refundId, razorpay_refund_id: result.razorpayRefundId, status: result.status });
    } catch (e) {
      // executeRefund already recorded a failed `refunds` row (if it got
      // that far) before throwing - this just maps it to an HTTP response.
      // A RefundValidationError never touched Razorpay at all (bad
      // order/amount/status), so it's a 400, not a gateway failure.
      return jsonResponse({ error: errorMessage(e) }, e instanceof RefundValidationError ? 400 : 502);
    }
  } catch (e) {
    console.error("create-razorpay-refund error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
