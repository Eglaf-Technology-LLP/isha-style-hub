import { corsHeaders, jsonResponse, serviceClient, getCallerUserId, isAdmin, errorMessage } from "../_shared/auth.ts";
import { executeRefund, RefundValidationError } from "../_shared/refunds.ts";

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
            .select("id, price, quantity, is_returnable")
            .in("id", orderItemIds);
          if (oiErr) throw oiErr;

          const eligibleTotal = (eligibleItems ?? [])
            .filter((oi) => oi.is_returnable)
            .reduce((sum, oi) => sum + Number(oi.price) * oi.quantity, 0);
          if (refundAmount > eligibleTotal) {
            return jsonResponse(
              {
                error: `Refund amount exceeds the refundable value of the selected items (₹${eligibleTotal.toFixed(2)}) - one or more selected items may be non-returnable`,
              },
              400,
            );
          }
        }
      }
    }

    try {
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
