import { corsHeaders, errorMessage, getCallerUserId, jsonResponse, serviceClient } from "../_shared/auth.ts";

// Starts the online payment for an order checkout has already saved. The
// amount is the order's own - worked out by the database from its items
// (price_order) less what the wallet paid - never a figure from the
// browser. The Razorpay order id is stored on our order here;
// verify-razorpay-payment and the webhook only accept a payment for that id.
//
// Body: { orderId }
// Returns { razorpayOrderId, amount (paise), currency, keyId }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId } = await req.json();
    if (!orderId || typeof orderId !== "string") {
      return jsonResponse({ error: "orderId is required" }, 400);
    }

    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
    }

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Please sign in again" }, 401);

    const supabase = serviceClient();
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, user_id, payment_method, payment_status, order_status, total, wallet_amount, razorpay_order_id")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order || order.user_id !== userId) return jsonResponse({ error: "Order not found" }, 404);
    if (order.payment_method !== "razorpay" || order.payment_status !== "pending" || order.order_status !== "pending") {
      return jsonResponse({ error: "This order can't be paid online any more" }, 409);
    }

    const amountPaise = Math.round((Number(order.total) - Number(order.wallet_amount ?? 0)) * 100);
    if (!(amountPaise >= 100)) {
      return jsonResponse({ error: "Nothing to pay online for this order" }, 400);
    }
    const reply = (razorpayOrderId: string) =>
      jsonResponse({ razorpayOrderId, amount: amountPaise, currency: "INR", keyId: RAZORPAY_KEY_ID });

    // Asked twice (a retried request): the same Razorpay order. Nothing on
    // the order can change once its payment row exists, so the amount holds.
    if (order.razorpay_order_id) return reply(order.razorpay_order_id);

    const auth = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      // Razorpay takes the smallest currency unit (paise for INR).
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: order.id,
        notes: { order_id: order.id },
      }),
    });

    if (!rzpRes.ok) {
      const t = await rzpRes.text();
      console.error("Razorpay order create error", rzpRes.status, t);
      return jsonResponse({ error: "Failed to create payment order" }, 502);
    }

    const rzpOrder = await rzpRes.json();
    const { data: saved, error: saveErr } = await supabase
      .from("orders")
      .update({ razorpay_order_id: rzpOrder.id })
      .eq("id", order.id)
      .is("razorpay_order_id", null)
      .select("razorpay_order_id")
      .maybeSingle();
    if (saveErr) throw saveErr;
    if (saved) return reply(saved.razorpay_order_id);

    // Another request stored one first - use that one.
    const { data: current } = await supabase.from("orders").select("razorpay_order_id").eq("id", order.id).maybeSingle();
    if (!current?.razorpay_order_id) throw new Error("Could not save the payment order");
    return reply(current.razorpay_order_id);
  } catch (error) {
    console.error("create-razorpay-order error:", error);
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
