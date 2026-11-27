import { corsHeaders, errorMessage, getCallerUserId, jsonResponse, serviceClient } from "../_shared/auth.ts";
import { BLOCKED_VENDOR_ORDER_STATUSES, cancelOneVendorOrder, CUSTOMER_CANCELLABLE_STATUSES } from "../_shared/cancellation.ts";

// A boutique cancels its own part of an order (client, 27 Nov 2026: Cancel
// button in the Seller Dashboard's Orders, Refunds column). The customer
// gets the full amount they paid for that part back to their ORIGINAL
// payment - the online payment (Razorpay), and any part paid from their
// AllBoutiqs wallet back to the wallet. No fee. A Cash on Delivery order
// was never paid, so there is nothing to refund.
//
// Only until the courier picks the part up (the same cut-off as the
// customer's own cancel): after that it is with the courier or our centre.
//
// POST { vendor_order_id, reason } -> 200 { cancelled, refund_error } | 4xx { error }

const REASON_MAX = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Please sign in again." }, 401);

    const body = await req.json().catch(() => ({}));
    const vendorOrderId = String(body.vendor_order_id ?? "");
    const reason = String(body.reason ?? "").replace(/\s+/g, " ").trim();
    if (!/^[0-9a-f-]{36}$/i.test(vendorOrderId)) return jsonResponse({ error: "Order not found." }, 400);
    if (reason.length < 3) return jsonResponse({ error: "Please give a reason." }, 400);
    if (reason.length > REASON_MAX) return jsonResponse({ error: `Please keep the reason under ${REASON_MAX} characters.` }, 400);

    const supabase = serviceClient();
    const { data: part, error: partErr } = await supabase
      .from("vendor_orders")
      .select("id, order_id, vendor_id, status, subtotal, shipping_cost")
      .eq("id", vendorOrderId)
      .maybeSingle();
    if (partErr) throw partErr;
    if (!part) return jsonResponse({ error: "Order not found." }, 404);

    // Only a member of this part's boutique.
    const { data: member } = await supabase
      .from("vendor_members")
      .select("user_id")
      .eq("vendor_id", part.vendor_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return jsonResponse({ error: "Order not found." }, 404);

    if (BLOCKED_VENDOR_ORDER_STATUSES.includes(part.status)) {
      return jsonResponse({ error: `This order is already ${part.status}.` }, 409);
    }
    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(part.status)) {
      return jsonResponse(
        { error: "The courier has already picked this order up, so it can't be cancelled here. Please contact AllBoutiqs." },
        409,
      );
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, payment_method, payment_status")
      .eq("id", part.order_id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return jsonResponse({ error: "Order not found." }, 404);

    const result = await cancelOneVendorOrder(supabase, {
      vendorOrder: part,
      order,
      cancelledBy: userId,
      reason,
      // In full, to the original payment (a wallet-paid share goes back to
      // the wallet, where it came from).
      refundMethod: "original",
      cancelledByLabel: "boutique",
    });
    if (!result.cancelled) {
      return jsonResponse({ error: `This order can't be cancelled: ${result.skippedReason}.` }, 409);
    }

    // The whole order is cancelled once every part is.
    const { data: siblings, error: sibErr } = await supabase.from("vendor_orders").select("status").eq("order_id", order.id);
    if (sibErr) throw sibErr;
    if ((siblings ?? []).every((vo) => vo.status === "cancelled")) {
      const { error: updErr } = await supabase.from("orders").update({ order_status: "cancelled" }).eq("id", order.id);
      if (updErr) throw updErr;
    }

    // Emails (the bells come from the database triggers). A failed email
    // never undoes the cancellation. The customer never sees which boutique,
    // or the boutique's own words.
    await Promise.all([
      supabase.functions
        .invoke("send-order-email", {
          body: { orderId: order.id, type: "cancelled", vendorOrderId: part.id, cancelReason: "The boutique couldn't fulfil it." },
        })
        .catch((e: unknown) => console.error("vendor-cancel-order: customer email failed", errorMessage(e))),
      result.cancellationId
        ? supabase.functions
            .invoke("send-order-cancellation-notice", {
              body: { order_cancellation_id: result.cancellationId, refund_error: result.refundError, cancelled_by: "boutique" },
            })
            .catch((e: unknown) => console.error("vendor-cancel-order: admin email failed", errorMessage(e)))
        : Promise.resolve(),
    ]);

    console.log("vendor-cancel-order: cancelled", part.id, `refund=${result.refundId ?? "-"}`, `wallet=${result.walletRefund}`, result.refundError ?? "");
    return jsonResponse({ cancelled: true, refund_error: result.refundError });
  } catch (e) {
    console.error("vendor-cancel-order failed", errorMessage(e));
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
