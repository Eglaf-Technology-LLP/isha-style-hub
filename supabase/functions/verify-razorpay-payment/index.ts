import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    // Only flip the order that actually matches the razorpay_order_id we
    // created it with - stops a verified payment for one order being
    // replayed against a different order id.
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .update({ payment_status: "paid", razorpay_payment_id })
      .eq("id", orderId)
      .eq("razorpay_order_id", razorpay_order_id)
      .select("id")
      .maybeSingle();

    if (orderErr) throw orderErr;
    if (!order) {
      return new Response(
        JSON.stringify({ verified: false, error: "Order/razorpay order id mismatch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch what Razorpay actually charged for this transaction, so the
    // platform's real net take (commission earned minus gateway fees) is
    // visible instead of only gross amounts. Best-effort: a failure here
    // shouldn't undo a payment that's genuinely verified - fee reporting
    // can be backfilled later, but the order being marked paid can't wait.
    let gatewayFee: number | null = null;
    let gatewayTax: number | null = null;
    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    if (RAZORPAY_KEY_ID) {
      try {
        const auth = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
        const feeRes = await fetch(
          `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
          { headers: { Authorization: auth } },
        );
        if (feeRes.ok) {
          const details = await feeRes.json();
          // fee is in paise and already includes tax (GST); tax is the
          // GST portion within that same fee, not additional to it.
          if (typeof details.fee === "number") gatewayFee = details.fee / 100;
          if (typeof details.tax === "number") gatewayTax = details.tax / 100;
        } else {
          console.error("Razorpay fee fetch failed", feeRes.status, await feeRes.text());
        }
      } catch (feeErr) {
        console.error("Razorpay fee fetch error", feeErr);
      }
    }

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
