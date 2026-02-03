import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY not configured, skipping email send");
    return { success: true, skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Isha Fashion Hub <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }

  return await response.json();
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

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; padding: 30px 20px; background: linear-gradient(135deg, #f5a623 0%, #f7c774 100%);">
            <h1 style="color: white; margin: 0; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">Isha Fashion Hub</h1>
          </div>
          
          <div style="padding: 30px;">
            <h2 style="color: #333; margin-top: 0;">You left something behind! 👜</h2>
            <p style="color: #666; line-height: 1.6;">
              We noticed you didn't complete your purchase. No worries – your items are still waiting for you!
            </p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background: #f5f5f5;">
                  <th style="padding: 12px; text-align: left;">Your Cart</th>
                  <th style="padding: 12px; text-align: right;">Price</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
              <tfoot>
                <tr style="font-weight: bold; background: #fef3e2;">
                  <td style="padding: 15px;">Cart Total:</td>
                  <td style="padding: 15px; text-align: right; color: #f5a623; font-size: 18px;">₹${cartTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${checkoutUrl}" style="display: inline-block; background: #f5a623; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Complete Your Purchase →
              </a>
            </div>
            
            <div style="background: #f0f7ff; padding: 20px; border-radius: 8px; margin-top: 20px;">
              <h3 style="color: #333; margin-top: 0; font-size: 14px;">✨ Why shop with us?</h3>
              <ul style="color: #666; margin: 0; padding-left: 20px; font-size: 13px;">
                <li>Free shipping on orders above ₹999</li>
                <li>Easy 7-day returns</li>
                <li>100% authentic products</li>
              </ul>
            </div>
          </div>
          
          <div style="text-align: center; padding: 20px; background: #f5f5f5; color: #999; font-size: 12px;">
            <p>If you have any questions, reply to this email or contact us!</p>
            <p>© 2024 Isha Fashion Hub. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailResult = await sendEmail(
      email,
      "You left items in your cart! Complete your purchase 🛒",
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
