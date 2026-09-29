import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, emailTemplate } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AbandonedCartRequest {
  email: string;
  cartItems: Array<{
    name: string;
    price: number;
    quantity: number;
    image?: string;
  }>;
  cartTotal: number;
  checkoutUrl: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, cartItems, cartTotal, checkoutUrl }: AbandonedCartRequest = await req.json();

    if (!email || !cartItems || cartItems.length === 0) {
      throw new Error("Missing email or cart items");
    }

    const itemsHtml = cartItems.map(item => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <div style="display: flex; align-items: center; gap: 12px;">
            ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">` : ''}
            <div>
              <strong>${item.name}</strong>
              <div style="color: #666; font-size: 12px;">Qty: ${item.quantity}</div>
            </div>
          </div>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join("");

    const bodyHtml = `
      <p style="color: #5a5a5a; line-height: 1.6;">
        We noticed you didn't complete your purchase. No worries — your items are still waiting for you!
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 20px 0; font-size:14px;">
        <thead>
          <tr>
            <th style="padding: 8px 0; text-align: left; border-bottom:2px solid #1a1a1a; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; color:#8a8a8a;">Your Cart</th>
            <th style="padding: 8px 0; text-align: right; border-bottom:2px solid #1a1a1a; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; color:#8a8a8a;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr style="font-weight: 700;">
            <td style="padding: 12px 0; border-top: 2px solid #1a1a1a;">Cart Total</td>
            <td style="padding: 12px 0; border-top: 2px solid #1a1a1a; text-align: right; color: #7a2e22; font-size: 16px;">₹${cartTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f2; border-radius:8px; padding:16px; margin-top:20px;">
        <tr><td>
          <p style="margin:0 0 8px; font-weight:700; font-size:13px; color:#1a1a1a;">Why shop with us?</p>
          <ul style="color: #5a5a5a; margin: 0; padding-left: 18px; font-size: 13px; line-height:1.7;">
            <li>Free shipping on orders above ₹999</li>
            <li>Easy 7-day returns</li>
            <li>100% authentic products</li>
          </ul>
        </td></tr>
      </table>
    `;

    const emailHtml = emailTemplate({
      heading: "You left something behind!",
      preheader: "Your cart is still waiting for you",
      bodyHtml,
      ctaLabel: "Complete Your Purchase",
      ctaUrl: checkoutUrl,
    });

    const emailResult = await sendEmail(
      email,
      "You left items in your cart! Complete your purchase",
      emailHtml
    );

    return new Response(
      JSON.stringify({ success: true, ...emailResult }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in abandoned-cart-reminder:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
