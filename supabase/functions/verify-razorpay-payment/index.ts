import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHeldTransfers } from "../_shared/razorpayRoute.ts";
import { refundLateCapture } from "../_shared/lateCapture.ts";
import { paidViaOf, withPaidVia } from "../_shared/paidVia.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// The client can never set payment_status='paid' itself (RLS lets it
// insert/select its own order, not declare its own payment successful) -
// this is the only place that happens, and only after verifying the
// signature Razorpay computed with a secret the client never sees.
async function verifySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${razorpayOrderId}|${razorpayPaymentId}`),
  );
  const computed = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      await req.json();

    if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!RAZORPAY_KEY_SECRET) throw new Error("RAZORPAY_KEY_SECRET not configured");

    const valid = await verifySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      RAZORPAY_KEY_SECRET,
    );

    if (!valid) {
      console.error("Razorpay signature mismatch for order", orderId);
      return new Response(JSON.stringify({ verified: false, error: "Signature mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Only the order that actually matches the razorpay_order_id we created
    // it with - stops a verified payment for one order being replayed
    // against a different order id.
    const { data: current, error: currentErr } = await supabase
      .from("orders")
      .select("id, order_status")
      .eq("id", orderId)
      .eq("razorpay_order_id", razorpay_order_id)
      .maybeSingle();
    if (currentErr) throw currentErr;
    if (!current) {
      return new Response(
        JSON.stringify({ verified: false, error: "Order/razorpay order id mismatch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // What Razorpay actually holds for this payment: its status, and the
    // fee it charged (so the platform's real net take is visible).
    // Best-effort: a failure here shouldn't undo a payment that's genuinely
    // verified - fee reporting can be backfilled later.
    let details: any = null;
    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    if (RAZORPAY_KEY_ID) {
      try {
        const auth = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
        const feeRes = await fetch(
          `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
          { headers: { Authorization: auth } },
        );
        if (feeRes.ok) details = await feeRes.json();
        else console.error("Razorpay payment fetch failed", feeRes.status, await feeRes.text());
      } catch (feeErr) {
        console.error("Razorpay payment fetch error", feeErr);
      }
    }

    // Released as unpaid before this payment came through (stock put back):
    // there is no order. A captured payment is refunded in full now; one
    // Razorpay hasn't captured yet is refunded by the payment.captured
    // webhook when it is. `verified: false` so the checkout never shows it
    // as placed or empties the cart.
    if (current.order_status === "cancelled") {
      if (details?.status === "captured" && details?.id === razorpay_payment_id) {
        await refundLateCapture(supabase, current.id, details);
      }
      return new Response(JSON.stringify({ verified: false, released: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // With how the customer paid (UPI, card, ...), in the same write that
    // marks it paid - the order-placed email goes out from that change.
    const { data: order, error: orderErr } = await withPaidVia(
      { payment_status: "paid", razorpay_payment_id },
      details?.id === razorpay_payment_id ? paidViaOf(details) : null,
      (fields) =>
        supabase
          .from("orders")
          .update(fields)
          .eq("id", orderId)
          .eq("razorpay_order_id", razorpay_order_id)
          .select("id")
          .maybeSingle(),
    );

    if (orderErr) throw orderErr;
    if (!order) {
      return new Response(
        JSON.stringify({ verified: false, error: "Order/razorpay order id mismatch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // fee is in paise and already includes tax (GST); tax is the GST
    // portion within that same fee, not additional to it.
    const gatewayFee: number | null = typeof details?.fee === "number" ? details.fee / 100 : null;
    const gatewayTax: number | null = typeof details?.tax === "number" ? details.tax / 100 : null;

    const { error: paymentErr } = await supabase
      .from("payments")
      .update({
        payment_status: "paid",
        transaction_id: razorpay_payment_id,
        gateway_fee: gatewayFee,
        gateway_tax: gatewayTax,
      })
      .eq("order_id", orderId);

    if (paymentErr) throw paymentErr;

    // Set each boutique's share aside in its Razorpay linked account (held
    // until delivery + return window). Never fails the payment itself.
    try {
      await createHeldTransfers(supabase, orderId, razorpay_payment_id);
    } catch (routeErr) {
      console.error("createHeldTransfers error", routeErr);
    }

    return new Response(JSON.stringify({ verified: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-razorpay-payment error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
