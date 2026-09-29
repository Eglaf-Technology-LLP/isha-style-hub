import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, emailTemplate } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// The customer's own order-confirmation email (send-order-email) never
// told the vendor or admin a new order existed at all - the in-app
// notification (see the notifications migration/trigger) covers "visible
// on the dashboard without an extra click"; this covers the "also by
// email" half of the same request. One email per vendor represented in
// the order (only their own items listed), plus every admin.
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { orderId } = await req.json();
    if (!orderId) throw new Error("Missing orderId");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, customer_name, total, payment_method")
      .eq("id", orderId)
      .single();
    if (orderError || !order) throw new Error("Order not found");

    const { data: items } = await supabase
      .from("order_items")
      .select("vendor_id, product_title, quantity, price")
      .eq("order_id", orderId);

    const byVendor = new Map<string, { product_title: string; quantity: number; price: number }[]>();
    (items ?? []).forEach((item) => {
      if (!item.vendor_id) return;
      const list = byVendor.get(item.vendor_id) ?? [];
      list.push(item);
      byVendor.set(item.vendor_id, list);
    });

    const vendorIds = [...byVendor.keys()];
    const { data: vendors } = vendorIds.length
      ? await supabase.from("vendors").select("id, name, contact_email").in("id", vendorIds)
      : { data: [] as { id: string; name: string; contact_email: string | null }[] };

    const itemsHtml = (list: { product_title: string; quantity: number; price: number }[]) =>
      `<ul style="margin:0; padding-left:20px; color:#3a3a3a;">${list
        .map((i) => `<li style="margin-bottom:4px;">${i.product_title} × ${i.quantity} — ₹${(i.price * i.quantity).toFixed(2)}</li>`)
        .join("")}</ul>`;

    const vendorSends = (vendors ?? [])
      .filter((v) => v.contact_email)
      .map((v) =>
        sendEmail(
          v.contact_email!,
          `New order received - #${orderId.slice(0, 8)} | AllBoutiqs`,
          emailTemplate({
            heading: "You've got a new order!",
            preheader: `A new order from ${order.customer_name} is waiting to be confirmed.`,
            bodyHtml: `
              <p style="color:#5a5a5a;">A new order from <strong>${order.customer_name}</strong> is waiting to be confirmed.</p>
              ${itemsHtml(byVendor.get(v.id) ?? [])}
              <p style="color:#5a5a5a; margin-top:20px;">Log in to your vendor dashboard to confirm and ship it.</p>
            `,
            ctaLabel: "Confirm Order",
            ctaUrl: "https://allboutiqs.com/vendor",
          })
        ).catch((e) => console.error("send-vendor-order-email: vendor email failed", v.contact_email, e))
      );

    // No email column anywhere in `public` schema - admin addresses come
    // from the Auth Admin API per user_roles row, same resolution already
    // used in send-return-status-email/send-order-cancellation-notice.
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminEmails = (
      await Promise.all(
        (adminRoles ?? []).map(async (r) => {
          const { data, error } = await supabase.auth.admin.getUserById(r.user_id);
          if (error || !data.user?.email) return null;
          return data.user.email;
        })
      )
    ).filter((e): e is string => !!e);

    const adminSends = adminEmails.map((email) =>
      sendEmail(
        email,
        `New order placed - #${orderId.slice(0, 8)} | AllBoutiqs`,
        emailTemplate({
          heading: "New order placed",
          preheader: `Order #${orderId.slice(0, 8)} from ${order.customer_name}`,
          bodyHtml: `<p style="color:#5a5a5a;">Order #${orderId.slice(0, 8)} from <strong>${order.customer_name}</strong> — ₹${Number(order.total).toFixed(2)} (${order.payment_method.toUpperCase()}).</p>`,
          ctaLabel: "View in Admin",
          ctaUrl: "https://allboutiqs.com/admin",
        })
      ).catch((e) => console.error("send-vendor-order-email: admin email failed", email, e))
    );

    await Promise.all([...vendorSends, ...adminSends]);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-vendor-order-email:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
