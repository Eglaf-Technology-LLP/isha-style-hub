import { itemOptionsLabel } from "../_shared/itemOptions.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { customisationHtml } from "../_shared/customisation.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, emailTemplate } from "../_shared/email.ts";
import { money } from "../_shared/money.ts";

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
      .select("id, customer_name, total, payment_method, payment_status")
      .eq("id", orderId)
      .single();
    if (orderError || !order) throw new Error("Order not found");

    // Only for a placed order (Cash on Delivery, or the online payment went
    // through), and only once - checkout and the database may both ask.
    const placed = order.payment_method === "cod" || ["paid", "refunded"].includes(order.payment_status);
    if (!placed) {
      return new Response(JSON.stringify({ skipped: "payment not completed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: claimed } = await supabase
      .from("orders")
      .update({ vendor_email_sent_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("vendor_email_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) {
      return new Response(JSON.stringify({ skipped: "already sent" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: items } = await supabase
      .from("order_items")
      .select("vendor_id, product_title, variant_title, size, color, quantity, price, customisation")
      .eq("order_id", orderId);

    type VendorItem = {
      product_title: string;
      variant_title: string | null;
      size: string | null;
      color: string | null;
      quantity: number;
      price: number;
      customisation?: unknown;
    };
    const byVendor = new Map<string, VendorItem[]>();
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

    const { data: vendorOrders } = await supabase
      .from("vendor_orders")
      .select("id, vendor_id, status")
      .eq("order_id", orderId);

    const makeAcceptanceUrl = async (vendorOrderId: string) => {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const tokenHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("vendor_order_acceptance_tokens").upsert({
        vendor_order_id: vendorOrderId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null,
      }, { onConflict: "vendor_order_id" });
      if (error) throw error;
      return `https://whycxtnjhdbewgyugfax.supabase.co/functions/v1/accept-vendor-order?token=${token}`;
    };

    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
    // "Size XS · Colour Red" under each piece, so the boutique knows what to make.
    const optionsHtml = (i: VendorItem) => {
      const label = itemOptionsLabel(i);
      return label ? `<br><span style="color:#8a8a8a; font-size:13px;">${escapeHtml(label)}</span>` : "";
    };
    const itemsHtml = (list: VendorItem[]) =>
      `<ul style="margin:0; padding-left:20px; color:#3a3a3a;">${list
        .map((i) => `<li style="margin-bottom:4px;">${i.product_title} × ${i.quantity} — ${money((i.price * i.quantity))}${optionsHtml(i)}${customisationHtml(i.customisation)}</li>`)
        .join("")}</ul>`;

    const vendorSends = (vendors ?? [])
      .filter((v) => v.contact_email)
      .map(async (v) => {
        try {
          const vendorOrder = (vendorOrders ?? []).find((vo) => vo.vendor_id === v.id);
          const canAccept = vendorOrder?.status === "pending";
          const ctaUrl = canAccept ? await makeAcceptanceUrl(vendorOrder.id) : "https://allboutiqs.com/vendor?tab=orders";
          await sendEmail(
            v.contact_email!,
            `New order received - #${orderId.slice(0, 8)} | AllBoutiqs`,
            emailTemplate({
              heading: "You've got a new order!",
              preheader: `A new order from ${order.customer_name} is waiting to be confirmed.`,
              bodyHtml: `
                <p style="color:#5a5a5a;">A new order from <strong>${order.customer_name}</strong> is waiting to be confirmed.</p>
                ${itemsHtml(byVendor.get(v.id) ?? [])}
                ${canAccept ? '<p style="color:#5a5a5a; margin-top:20px;">Accept this order with one tap. The link expires in 7 days and can only be used once.</p>' : ""}
              `,
              ctaLabel: canAccept ? "Accept order" : "View orders",
              ctaUrl,
            })
          );
        } catch (e) {
          console.error("send-vendor-order-email: vendor email failed", v.contact_email, e);
        }
      });

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
          bodyHtml: `<p style="color:#5a5a5a;">Order #${orderId.slice(0, 8)} from <strong>${order.customer_name}</strong> — ${money(Number(order.total))} (${order.payment_method.toUpperCase()}).</p>`,
          ctaLabel: "View in Admin",
          ctaUrl: "https://allboutiqs.com/admin",
        })
      ).catch((e) => console.error("send-vendor-order-email: admin email failed", email, e))
    );

    await Promise.all([...vendorSends, ...adminSends]);

    // No e-way bill request here: it is asked for when the boutique packs the
    // order (Ship Now), with its tax invoice - a Made to Order piece can ship
    // weeks after the order (client corrections Part 2, A16.1).

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
