import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, emailTemplate } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface OrderEmailRequest {
  orderId: string;
  type: "confirmation" | "shipped" | "delivered" | "cancelled";
  // Cancellation is per-vendor - a multi-vendor order can have one
  // vendor's portion cancelled while the rest ships normally, so the
  // "cancelled" case needs to know which vendor_order this was to phrase
  // a partial cancellation correctly instead of implying the whole order
  // was cancelled.
  vendorOrderId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, type, vendorOrderId }: OrderEmailRequest = await req.json();

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

    // order.order_status is only "cancelled" here if every vendor_order was
    // already cancelled by the time this fires - cancel-vendor-order updates
    // that before invoking this function, so no race with the check below.
    let cancelledVendorName: string | null = null;
    if (type === "cancelled" && vendorOrderId) {
      const { data: vo } = await supabase
        .from("vendor_orders")
        .select("vendor:vendors(name)")
        .eq("id", vendorOrderId)
        .maybeSingle();
      cancelledVendorName = (vo as any)?.vendor?.name ?? null;
    }
    const isPartialCancellation = type === "cancelled" && order.order_status !== "cancelled";

    let subject: string;
    let heading: string;
    let message: string;

    const orderNumber = order.id.slice(0, 8).toUpperCase();

    switch (type) {
      case "confirmation":
        subject = `Order Confirmed - #${orderNumber} | AllBoutiqs`;
        heading = "Thank you for your order!";
        message = "We've received your order and are preparing it for shipment.";
        break;
      case "shipped":
        subject = `Order Shipped - #${orderNumber} | AllBoutiqs`;
        heading = "Your order is on its way!";
        message = "Great news! Your order has been shipped.";
        break;
      case "delivered":
        subject = `Order Delivered - #${orderNumber} | AllBoutiqs`;
        heading = "Your order has been delivered!";
        message = "We hope you love your purchase!";
        break;
      case "cancelled": {
        const refundNote =
          order.payment_method === "razorpay"
            ? " If you paid online, your refund will be credited to your original payment method within a few business days."
            : "";
        if (isPartialCancellation) {
          subject = `Part of Your Order Cancelled - #${orderNumber} | AllBoutiqs`;
          heading = "Part of your order has been cancelled";
          message = `The ${cancelledVendorName || "selected"} portion of your order has been cancelled as requested. The rest of your order is still being processed.${refundNote}`;
        } else {
          subject = `Order Cancelled - #${orderNumber} | AllBoutiqs`;
          heading = "Your order has been cancelled";
          message = `As requested, your order has been cancelled.${refundNote}`;
        }
        break;
      }
      default:
        throw new Error("Invalid email type");
    }

    const itemsHtml = items?.map(item => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
          <strong style="color:#1a1a1a;">${item.product_title}</strong>
          ${item.size ? `<br><span style="color: #8a8a8a; font-size:13px;">Size: ${item.size}</span>` : ""}
          ${item.color ? `<span style="color: #8a8a8a; font-size:13px;"> · Color: ${item.color}</span>` : ""}
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join("") || "";

    const shippingAddress = order.shipping_address as any;

    const bodyHtml = `
      <p style="color:#5a5a5a;">${message}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f2; border-radius:8px; padding:16px; margin:20px 0; font-size:14px;">
        <tr><td style="padding:2px 0;"><strong>Order:</strong> #${orderNumber}</td></tr>
        <tr><td style="padding:2px 0;"><strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString('en-IN')}</td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px;">
        <thead>
          <tr>
            <th style="padding: 8px 0; text-align: left; border-bottom:2px solid #1a1a1a; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; color:#8a8a8a;">Item</th>
            <th style="padding: 8px 0; text-align: center; border-bottom:2px solid #1a1a1a; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; color:#8a8a8a;">Qty</th>
            <th style="padding: 8px 0; text-align: right; border-bottom:2px solid #1a1a1a; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; color:#8a8a8a;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr style="font-weight: 700;">
            <td colspan="2" style="padding: 12px 0; text-align: right; border-top: 2px solid #1a1a1a;">Total</td>
            <td style="padding: 12px 0; text-align: right; border-top: 2px solid #1a1a1a;">₹${order.total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f2; border-radius:8px; padding:16px; margin-top:20px; font-size:14px;">
        <tr><td>
          <p style="margin:0 0 6px; font-weight:700; color:#1a1a1a;">Shipping Address</p>
          <p style="margin:0; color:#5a5a5a; line-height:1.6;">${order.customer_name}<br>
          ${shippingAddress.address_line1}<br>
          ${shippingAddress.city}, ${shippingAddress.state} - ${shippingAddress.pincode}<br>
          ${order.customer_phone}</p>
        </td></tr>
      </table>
    `;

    const emailHtml = emailTemplate({
      heading,
      preheader: message,
      bodyHtml,
      ctaLabel: "View Order",
      ctaUrl: "https://allboutiqs.com/orders",
    });

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
