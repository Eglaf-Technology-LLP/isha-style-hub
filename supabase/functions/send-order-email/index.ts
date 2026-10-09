import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, emailTemplate } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// "confirmation" is the order-placed email checkout sends. The delivery
// steps (confirmed .. delivered) are sent per boutique shipment by the
// notify_customer_order_status trigger whenever a vendor_order's status
// changes; "cancelled" comes from the cancellation flow.
type EmailType =
  | "confirmation"
  | "confirmed"
  | "shipped"
  | "out_for_delivery"
  | "delivery_failed"
  | "delivered"
  | "cancelled";

interface OrderEmailRequest {
  orderId: string;
  type: EmailType;
  // The boutique's part of the order this update is about. Required for
  // the delivery steps; for "cancelled" it phrases a partial cancellation
  // correctly instead of implying the whole order was cancelled.
  vendorOrderId?: string;
}

const STEPS = ["Placed", "Confirmed", "Shipped", "Out for delivery", "Delivered"];
const STEP_FOR: Partial<Record<EmailType, number>> = {
  confirmation: 0,
  confirmed: 1,
  shipped: 2,
  out_for_delivery: 3,
  delivery_failed: 3,
  delivered: 4,
};

// Status updates may only come from our own server (the trigger or another
// function, using the service-role key) - otherwise anyone could send a
// customer a fake "delivered" email. The order-placed email is still sent
// from checkout.
function isServiceRoleCall(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Email-safe progress tracker (tables only, no CSS the big clients drop).
// Each step's cell carries its own left/right line segments, so the line
// runs through the middle of the dots in every client.
function progressTracker(current: number, failedAt: number | null): string {
  const maroon = "#7a2e22";
  const amber = "#b45309";
  const track = "#e6ddd4";
  const last = STEPS.length - 1;
  const segment = (color: string) =>
    `<td valign="middle" style="padding:0;"><div style="height:3px; background:${color}; font-size:0; line-height:0;">&nbsp;</div></td>`;
  const cells = STEPS.map((label, i) => {
    const failed = failedAt === i;
    const done = i < current || (i === current && failedAt === null);
    const isCurrent = i === current;
    const dotBg = failed ? amber : done ? maroon : "#ffffff";
    const dotBorder = failed ? amber : done || isCurrent ? maroon : "#d9cfc6";
    const mark = failed ? "!" : done ? "&#10003;" : "&nbsp;";
    const labelColor = failed ? amber : done || isCurrent ? "#1a1a1a" : "#9a9a9a";
    return `<td width="20%" align="center" valign="top" style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${segment(i === 0 ? "transparent" : i <= current ? maroon : track)}
        <td width="26" valign="middle" style="width:26px; padding:0;"><div style="width:22px; height:22px; border-radius:50%; background:${dotBg}; border:2px solid ${dotBorder}; color:#ffffff; font-size:12px; font-weight:700; line-height:22px; text-align:center;">${mark}</div></td>
        ${segment(i === last ? "transparent" : i + 1 <= current ? maroon : track)}
      </tr></table>
      <div style="margin-top:6px; padding:0 2px; font-size:11px; line-height:1.3; color:${labelColor}; font-weight:${isCurrent ? 700 : 400};">${failed ? "Attempt failed" : label}</div>
    </td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr>${cells}</tr></table>`;
}

const infoBox = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f2; border-radius:8px; margin:20px 0; font-size:14px;">
    <tr><td style="padding:14px 16px;">
      ${rows.map(([k, v]) => `<div style="padding:2px 0;"><strong style="color:#1a1a1a;">${k}:</strong> <span style="color:#3a3a3a;">${v}</span></div>`).join("")}
    </td></tr>
  </table>`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, type, vendorOrderId }: OrderEmailRequest = await req.json();

    if (!orderId || !type) {
      throw new Error("Missing orderId or type");
    }
    if (type !== "confirmation" && !isServiceRoleCall(req)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
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

    const { data: allItems } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    const { data: vendorOrders } = await supabase
      .from("vendor_orders")
      .select("id, vendor:vendors(name, return_window_days)")
      .eq("order_id", orderId);
    const thisVendorOrder = (vendorOrders ?? []).find((v: any) => v.id === vendorOrderId) as any;
    const boutique: string | null = thisVendorOrder?.vendor?.name ?? null;
    const multiBoutique = (vendorOrders?.length ?? 0) > 1;

    const isDeliveryStep = type in STEP_FOR && type !== "confirmation";
    if (isDeliveryStep && !thisVendorOrder) throw new Error("vendorOrderId is required for delivery updates");

    // Delivery updates list only the items in this boutique's shipment.
    const items = isDeliveryStep
      ? (allItems ?? []).filter((i: any) => i.vendor_order_id === vendorOrderId)
      : allItems ?? [];

    const { data: shipment } = isDeliveryStep
      ? await supabase
          .from("shipments")
          .select("awb_code, courier_name, estimated_delivery_date")
          .eq("vendor_order_id", vendorOrderId)
          .in("shipment_type", ["forward", "exchange_forward"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    // order.order_status is only "cancelled" here if every vendor_order was
    // already cancelled by the time this fires - cancel-vendor-order updates
    // that before invoking this function, so no race with the check below.
    const isPartialCancellation = type === "cancelled" && order.order_status !== "cancelled";

    const orderNumber = order.id.slice(0, 8).toUpperCase();
    const from = boutique ? escapeHtml(boutique) : "The boutique";
    const partNote =
      isDeliveryStep && multiBoutique
        ? `<p style="color:#6a6a6a; font-size:13px; margin:0 0 4px;">This update is for the items from ${escapeHtml(boutique)}. Other items in your order are shipped separately, and you'll get updates for them too.</p>`
        : "";
    const trackingUrl = shipment?.awb_code ? `https://shiprocket.co/tracking/${encodeURIComponent(shipment.awb_code)}` : null;
    const eta = shipment?.estimated_delivery_date
      ? new Date(shipment.estimated_delivery_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
      : null;
    const orderUrl = `https://allboutiqs.com/orders?focus=${order.id}`;

    let subject: string;
    let heading: string;
    let message: string;
    let extraHtml = "";
    let cta = { label: "View Order", url: orderUrl };

    switch (type) {
      case "confirmation":
        subject = `Order Placed - #${orderNumber} | AllBoutiqs`;
        heading = "Thank you for your order!";
        message = "We've received your order. We'll email you as soon as the boutique confirms it, and again at every step until it reaches you.";
        break;
      case "confirmed":
        subject = `Your order #${orderNumber} is confirmed | AllBoutiqs`;
        heading = "Your order is confirmed";
        message = `${from} has confirmed your order and is getting it ready to ship. We'll email you the tracking details as soon as it ships.`;
        break;
      case "shipped":
        subject = `Your order #${orderNumber} has shipped | AllBoutiqs`;
        heading = "Your order is on its way!";
        message = `${from} has handed your order to the courier.`;
        extraHtml = infoBox([
          ...(shipment?.courier_name ? [["Courier", escapeHtml(shipment.courier_name)] as [string, string]] : []),
          ...(shipment?.awb_code ? [["Tracking number", escapeHtml(shipment.awb_code)] as [string, string]] : []),
          ...(eta ? [["Expected delivery", eta] as [string, string]] : []),
        ]);
        if (trackingUrl) cta = { label: "Track Your Package", url: trackingUrl };
        break;
      case "out_for_delivery":
        subject = `Out for delivery today - #${orderNumber} | AllBoutiqs`;
        heading = "Your order is out for delivery";
        message = `Your order should reach you today. Please keep your phone reachable for the delivery partner${
          order.payment_method === "cod" ? ", and keep the Cash on Delivery amount ready" : ""
        }.`;
        if (trackingUrl) cta = { label: "Track Your Package", url: trackingUrl };
        break;
      case "delivery_failed":
        subject = `Delivery attempt unsuccessful - #${orderNumber} | AllBoutiqs`;
        heading = "We couldn't deliver your order today";
        message =
          "The courier tried to deliver your order but couldn't complete it. They'll try again - please keep your phone reachable. If you need to change anything, just reply to this email.";
        if (trackingUrl) cta = { label: "Track Your Package", url: trackingUrl };
        break;
      case "delivered": {
        const windowDays = thisVendorOrder?.vendor?.return_window_days;
        subject = `Delivered - your order #${orderNumber} | AllBoutiqs`;
        heading = "Your order has been delivered!";
        message = `We hope you love it! If something isn't right, you can request a return or exchange from My Orders${
          windowDays ? ` within ${windowDays} days` : ""
        }.`;
        break;
      }
      case "cancelled": {
        const refundNote =
          order.payment_method === "razorpay"
            ? " If you paid online, your refund will be credited to your original payment method within a few business days."
            : "";
        if (isPartialCancellation) {
          subject = `Part of Your Order Cancelled - #${orderNumber} | AllBoutiqs`;
          heading = "Part of your order has been cancelled";
          message = `The ${boutique ? escapeHtml(boutique) : "selected"} portion of your order has been cancelled as requested. The rest of your order is still being processed.${refundNote}`;
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

    const step = STEP_FOR[type];
    const tracker = step === undefined ? "" : progressTracker(step, type === "delivery_failed" ? step : null);

    const itemsHtml = items.map((item: any) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
          <strong style="color:#1a1a1a;">${escapeHtml(item.product_title)}</strong>
          ${
            item.size || item.color
              ? `<br><span style="color: #8a8a8a; font-size:13px;">${[
                  item.size ? `Size: ${escapeHtml(item.size)}` : "",
                  item.color ? `Color: ${escapeHtml(item.color)}` : "",
                ].filter(Boolean).join(" · ")}</span>`
              : ""
          }
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join("");

    // The order total only makes sense when the email lists the whole order.
    const showTotal = !isDeliveryStep || !multiBoutique;
    const shippingAddress = order.shipping_address as any;

    const bodyHtml = `
      <p style="color:#5a5a5a; margin:0 0 4px;">${message}</p>
      ${tracker}
      ${extraHtml}
      ${infoBox([
        ["Order", `#${orderNumber}`],
        ["Placed on", new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })],
        ...(isDeliveryStep && boutique ? [["Boutique", escapeHtml(boutique)] as [string, string]] : []),
      ])}
      ${partNote}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px;">
        <thead>
          <tr>
            <th style="padding: 8px 0; text-align: left; border-bottom:2px solid #1a1a1a; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; color:#8a8a8a;">${isDeliveryStep && multiBoutique ? "Items in this shipment" : "Item"}</th>
            <th style="padding: 8px 0; text-align: center; border-bottom:2px solid #1a1a1a; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; color:#8a8a8a;">Qty</th>
            <th style="padding: 8px 0; text-align: right; border-bottom:2px solid #1a1a1a; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; color:#8a8a8a;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        ${
          showTotal
            ? `<tfoot>
          <tr style="font-weight: 700;">
            <td colspan="2" style="padding: 12px 16px 12px 0; text-align: right; border-top: 2px solid #1a1a1a;">Total</td>
            <td style="padding: 12px 0; text-align: right; border-top: 2px solid #1a1a1a;">₹${order.total.toFixed(2)}</td>
          </tr>
        </tfoot>`
            : ""
        }
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f2; border-radius:8px; margin-top:20px; font-size:14px;">
        <tr><td style="padding:14px 16px;">
          <p style="margin:0 0 6px; font-weight:700; color:#1a1a1a;">Delivery Address</p>
          <p style="margin:0; color:#5a5a5a; line-height:1.6;">${escapeHtml(order.customer_name)}<br>
          ${escapeHtml(shippingAddress?.address_line1)}<br>
          ${escapeHtml(shippingAddress?.city)}, ${escapeHtml(shippingAddress?.state)} - ${escapeHtml(shippingAddress?.pincode)}<br>
          ${escapeHtml(order.customer_phone)}</p>
        </td></tr>
      </table>
    `;

    const emailHtml = emailTemplate({
      heading,
      preheader: message.replace(/<[^>]+>/g, ""),
      bodyHtml,
      ctaLabel: cta.label,
      ctaUrl: cta.url,
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
