import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ReturnEmailRequest {
  returnRequestId: string;
  newStatus: string;
  adminNotes?: string;
  refundAmount?: number;
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

function getStatusContent(status: string, requestType: string) {
  const typeLabel = requestType === "exchange" ? "Exchange" : "Return";

  switch (status) {
    case "approved":
      return {
        heading: `Your ${typeLabel} Request Has Been Approved!`,
        message:
          requestType === "return"
            ? "We've approved your return request. Please keep the items ready for pickup."
            : "We've approved your exchange request. We'll arrange for the pickup and replacement shortly.",
        color: "#22c55e",
      };
    case "rejected":
      return {
        heading: `${typeLabel} Request Update`,
        message: `Unfortunately, we were unable to approve your ${typeLabel.toLowerCase()} request. Please see the details below for more information.`,
        color: "#ef4444",
      };
    case "picked_up":
      return {
        heading: `Items Picked Up – ${typeLabel} in Progress`,
        message:
          requestType === "return"
            ? "We've picked up the items. Your refund will be processed shortly."
            : "We've picked up the items. Your replacement will be shipped soon.",
        color: "#6366f1",
      };
    case "completed":
      return {
        heading: `${typeLabel} Completed!`,
        message:
          requestType === "return"
            ? "Your return has been completed and the refund has been processed."
            : "Your exchange has been completed. We hope you love the replacement!",
        color: "#22c55e",
      };
    case "pickup_failed":
      return {
        heading: `A Quick Update on Your ${typeLabel}`,
        message:
          "We ran into a hiccup getting the courier pickup scheduled. Our team has been notified and will sort this out shortly - no action is needed from you right now.",
        color: "#f59e0b",
      };
    default:
      return {
        heading: `${typeLabel} Request Update`,
        message: `Your ${typeLabel.toLowerCase()} request status has been updated.`,
        color: "#f5a623",
      };
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { returnRequestId, newStatus, adminNotes, refundAmount }: ReturnEmailRequest =
      await req.json();

    if (!returnRequestId || !newStatus) {
      throw new Error("Missing returnRequestId or newStatus");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get return request
    const { data: returnReq, error: rrError } = await supabase
      .from("return_requests")
      .select("*")
      .eq("id", returnRequestId)
      .single();

    if (rrError || !returnReq) throw new Error("Return request not found");

    // Get order to find customer email
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("customer_email, customer_name, id")
      .eq("id", returnReq.order_id)
      .single();

    if (orderError || !order) throw new Error("Order not found");

    const { heading, message, color } = getStatusContent(
      newStatus,
      returnReq.request_type
    );

    const orderNumber = order.id.slice(0, 8).toUpperCase();
    const requestId = returnReq.id.slice(0, 8).toUpperCase();
    const items = (returnReq.items as any[]) || [];

    const itemsHtml = items
      .map(
        (item: any) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.product_title}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
          ${item.size ? item.size : "-"}${item.color ? ` / ${item.color}` : ""}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      </tr>`
      )
      .join("");

    const refundHtml =
      newStatus === "completed" && returnReq.request_type === "return" && (refundAmount || returnReq.refund_amount)
        ? `<div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0; color: #166534; font-weight: bold;">Refund Amount: ₹${(refundAmount || returnReq.refund_amount || 0).toFixed(2)}</p>
           </div>`
        : "";

    const adminNotesHtml =
      adminNotes || returnReq.admin_notes
        ? `<div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0 0 4px; font-weight: bold; font-size: 14px;">Note from our team:</p>
            <p style="margin: 0; color: #666;">${adminNotes || returnReq.admin_notes}</p>
           </div>`
        : "";

    const subject = `${returnReq.request_type === "exchange" ? "Exchange" : "Return"} Request ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)} – #${requestId} | AllBoutiqs`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #f5a623;">
          <h1 style="color: #f5a623; margin: 0;">AllBoutiqs</h1>
        </div>
        <div style="padding: 30px 0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: ${color}; color: white; padding: 8px 20px; border-radius: 20px; font-weight: bold; font-size: 14px;">
              ${newStatus.replace("_", " ").toUpperCase()}
            </div>
          </div>
          <h2 style="text-align: center;">${heading}</h2>
          <p style="color: #666; text-align: center;">${message}</p>
          
          <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 4px 0;"><strong>Request ID:</strong> #${requestId}</p>
            <p style="margin: 4px 0;"><strong>Order:</strong> #${orderNumber}</p>
            <p style="margin: 4px 0;"><strong>Type:</strong> ${returnReq.request_type === "exchange" ? "Exchange" : "Return"}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 10px; text-align: left;">Item</th>
                <th style="padding: 10px; text-align: center;">Variant</th>
                <th style="padding: 10px; text-align: center;">Qty</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          ${refundHtml}
          ${adminNotesHtml}
        </div>
        <div style="text-align: center; padding: 20px; border-top: 1px solid #eee; color: #999;">
          <p>Thank you for shopping with AllBoutiqs!</p>
          <p style="font-size: 12px;">If you have any questions, please contact our support team.</p>
        </div>
      </body>
      </html>
    `;

    const emailResult = await sendEmail(order.customer_email, subject, emailHtml);

    // pickup_failed needs a human to actually act (reschedule the pickup,
    // contact the customer) - unlike every other status here, which is
    // purely informational, this is the one case that also alerts admins
    // and the affected vendor(s), not just the customer.
    if (newStatus === "pickup_failed") {
      const orderItemIds = items.map((item: any) => item.order_item_id).filter(Boolean);
      const { data: affectedItems } = orderItemIds.length
        ? await supabase.from("order_items").select("vendor_id").in("id", orderItemIds)
        : { data: [] as { vendor_id: string | null }[] };
      const vendorIds = [
        ...new Set((affectedItems ?? []).map((i) => i.vendor_id).filter((v): v is string => !!v)),
      ];

      const { data: vendors } = vendorIds.length
        ? await supabase.from("vendors").select("contact_email").in("id", vendorIds)
        : { data: [] as { contact_email: string | null }[] };
      const vendorEmails = (vendors ?? []).map((v) => v.contact_email).filter((e): e is string => !!e);

      // No email column anywhere in `public` schema - admin addresses
      // have to come from the Auth Admin API per user_roles row, same
      // resolution already proven in send-order-cancellation-notice.
      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const adminEmails = (
        await Promise.all(
          (adminRoles ?? []).map(async (r) => {
            const { data, error } = await supabase.auth.admin.getUserById(r.user_id);
            if (error || !data.user?.email) return null;
            return data.user.email;
          }),
        )
      ).filter((e): e is string => !!e);

      const attentionSubject = `Action needed: courier pickup failed - #${requestId} | AllBoutiqs`;
      await Promise.all(
        [...vendorEmails, ...adminEmails].map((email) =>
          sendEmail(email, attentionSubject, emailHtml).catch((e) =>
            console.error("send-return-status-email: attention email failed", email, e),
          ),
        ),
      );
    }

    return new Response(JSON.stringify({ success: true, ...emailResult }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-return-status-email:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
