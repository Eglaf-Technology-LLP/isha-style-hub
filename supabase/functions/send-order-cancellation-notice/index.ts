import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CancellationNoticeRequest {
  order_cancellation_id: string;
  // Passed straight through from cancel-vendor-order for this one send only
  // - not persisted (order_cancellations has no such column), just surfaced
  // to a human immediately when the automatic refund itself failed.
  refund_error?: string | null;
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
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AllBoutiqs <onboarding@resend.dev>",
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

function buildEmailHtml(params: {
  recipientLabel: string;
  orderNumber: string;
  vendorName: string;
  reason: string;
  wasAlreadyShipped: boolean;
  refundAmount: number | null;
  refundError?: string | null;
}) {
  const { recipientLabel, orderNumber, vendorName, reason, wasAlreadyShipped, refundAmount, refundError } = params;

  const shippedNoticeHtml = wasAlreadyShipped
    ? `<div style="background: #fff7ed; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0; color: #9a3412; font-weight: bold;">This item had already been picked up by the courier before the cancellation.</p>
        <p style="margin: 4px 0 0; color: #9a3412;">The shipment could not be recalled - please arrange for the return/refusal of the physical package separately.</p>
       </div>`
    : "";

  const refundHtml = refundError
    ? `<div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0; color: #991b1b; font-weight: bold;">Automatic refund failed - manual action needed</p>
        <p style="margin: 4px 0 0; color: #991b1b;">${refundError}</p>
       </div>`
    : refundAmount !== null
      ? `<div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0; color: #166534; font-weight: bold;">Refund issued: ₹${refundAmount.toFixed(2)}</p>
         </div>`
      : "";

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #f5a623;">
        <h1 style="color: #f5a623; margin: 0;">AllBoutiqs</h1>
      </div>
      <div style="padding: 30px 0;">
        <h2>Order Cancelled by Customer</h2>
        <p style="color: #666;">${recipientLabel}, a customer has cancelled the ${vendorName} portion of an order.</p>
        <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Order:</strong> #${orderNumber}</p>
          <p style="margin: 4px 0;"><strong>Vendor:</strong> ${vendorName}</p>
          <p style="margin: 4px 0;"><strong>Reason given:</strong> ${reason}</p>
        </div>
        ${shippedNoticeHtml}
        ${refundHtml}
      </div>
      <div style="text-align: center; padding: 20px; border-top: 1px solid #eee; color: #999;">
        <p>AllBoutiqs - Order Management</p>
      </div>
    </body>
    </html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { order_cancellation_id, refund_error }: CancellationNoticeRequest = await req.json();
    if (!order_cancellation_id) throw new Error("Missing order_cancellation_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: cancellation, error: cancellationError } = await supabase
      .from("order_cancellations")
      .select("id, order_id, vendor_order_id, reason, was_already_shipped, refund_id")
      .eq("id", order_cancellation_id)
      .single();
    if (cancellationError || !cancellation) throw new Error("Order cancellation not found");

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id")
      .eq("id", cancellation.order_id)
      .single();
    if (orderError || !order) throw new Error("Order not found");

    const { data: vendorOrder, error: voError } = await supabase
      .from("vendor_orders")
      .select("vendor:vendors(name, contact_email)")
      .eq("id", cancellation.vendor_order_id)
      .single();
    if (voError || !vendorOrder) throw new Error("Vendor order not found");

    const vendor = (vendorOrder as any).vendor as { name: string; contact_email: string | null } | null;

    let refundAmount: number | null = null;
    if (cancellation.refund_id) {
      const { data: refund } = await supabase
        .from("refunds")
        .select("amount")
        .eq("id", cancellation.refund_id)
        .maybeSingle();
      refundAmount = refund ? Number(refund.amount) : null;
    }

    const orderNumber = order.id.slice(0, 8).toUpperCase();
    const subject = `Order Cancelled by Customer - #${orderNumber} | ${vendor?.name || "Vendor"}`;

    const results: Record<string, unknown> = {};

    if (vendor?.contact_email) {
      const html = buildEmailHtml({
        recipientLabel: "Hi",
        orderNumber,
        vendorName: vendor.name,
        reason: cancellation.reason || "Not specified",
        wasAlreadyShipped: cancellation.was_already_shipped,
        refundAmount,
        refundError: refund_error,
      });
      try {
        results.vendor = await sendEmail(vendor.contact_email, subject, html);
      } catch (e) {
        console.error("send-order-cancellation-notice: vendor email failed", e);
      }
    } else {
      console.error("send-order-cancellation-notice: vendor has no contact_email, skipping", vendor?.name);
    }

    // No email column anywhere in `public` - user_roles only has user_id,
    // so admin addresses have to come from the Auth Admin API per id
    // (small, fixed set of admins in this app - no pagination needed).
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminUserIds = (adminRoles ?? []).map((r) => r.user_id);
    const adminEmails = (
      await Promise.all(
        adminUserIds.map(async (id) => {
          const { data, error } = await supabase.auth.admin.getUserById(id);
          if (error || !data.user?.email) return null;
          return data.user.email;
        }),
      )
    ).filter((e): e is string => !!e);

    if (adminEmails.length > 0) {
      const html = buildEmailHtml({
        recipientLabel: "Admin notice",
        orderNumber,
        vendorName: vendor?.name || "Vendor",
        reason: cancellation.reason || "Not specified",
        wasAlreadyShipped: cancellation.was_already_shipped,
        refundAmount,
        refundError: refund_error,
      });
      results.admin = await Promise.all(
        adminEmails.map((email) =>
          sendEmail(email, subject, html).catch((e) => {
            console.error("send-order-cancellation-notice: admin email failed", email, e);
            return null;
          }),
        ),
      );
    } else {
      console.error("send-order-cancellation-notice: no admin emails resolved");
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-order-cancellation-notice:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
