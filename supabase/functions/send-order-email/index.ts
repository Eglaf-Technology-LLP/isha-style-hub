import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface OrderEmailRequest {
  orderId: string;
  type: "confirmation" | "shipped" | "delivered";
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
    const { orderId, type }: OrderEmailRequest = await req.json();

    if (!orderId || !type) {
      throw new Error("Missing orderId or type");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error("Order not found");
    }

    const { data: items } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    let subject: string;
    let heading: string;
    let message: string;

    const orderNumber = order.id.slice(0, 8).toUpperCase();

    switch (type) {
      case "confirmation":
        subject = `Order Confirmed - #${orderNumber} | Isha Fashion Hub`;
        heading = "Thank you for your order!";
        message = "We've received your order and are preparing it for shipment.";
        break;
      case "shipped":
        subject = `Order Shipped - #${orderNumber} | Isha Fashion Hub`;
        heading = "Your order is on its way!";
        message = "Great news! Your order has been shipped.";
        break;
      case "delivered":
        subject = `Order Delivered - #${orderNumber} | Isha Fashion Hub`;
        heading = "Your order has been delivered!";
        message = "We hope you love your purchase!";
        break;
      default:
        throw new Error("Invalid email type");
    }

    const itemsHtml = items?.map(item => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <strong>${item.product_title}</strong>
          ${item.size ? `<br><span style="color: #666;">Size: ${item.size}</span>` : ""}
          ${item.color ? `<span style="color: #666;"> | Color: ${item.color}</span>` : ""}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join("") || "";

    const shippingAddress = order.shipping_address as any;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #f5a623;">
          <h1 style="color: #f5a623; margin: 0;">Isha Fashion Hub</h1>
        </div>
        <div style="padding: 30px 0;">
          <h2>${heading}</h2>
          <p style="color: #666;">${message}</p>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Order:</strong> #${orderNumber}</p>
            <p><strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString('en-IN')}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 12px; text-align: left;">Item</th>
                <th style="padding: 12px; text-align: center;">Qty</th>
                <th style="padding: 12px; text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr style="font-weight: bold;">
                <td colspan="2" style="padding: 12px; text-align: right; border-top: 2px solid #333;">Total:</td>
                <td style="padding: 12px; text-align: right; border-top: 2px solid #333;">₹${order.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-top: 20px;">
            <h3>Shipping Address</h3>
            <p>${order.customer_name}<br>
            ${shippingAddress.address_line1}<br>
            ${shippingAddress.city}, ${shippingAddress.state} - ${shippingAddress.pincode}<br>
            ${order.customer_phone}</p>
          </div>
        </div>
        <div style="text-align: center; padding: 20px; border-top: 1px solid #eee; color: #999;">
          <p>Thank you for shopping with Isha Fashion Hub!</p>
        </div>
      </body>
      </html>
    `;

    const emailResult = await sendEmail(order.customer_email, subject, emailHtml);

    return new Response(
      JSON.stringify({ success: true, ...emailResult }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-order-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
