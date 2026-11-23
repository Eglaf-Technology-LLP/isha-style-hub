import { SITE_URL } from "../_shared/urls.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, emailTemplate } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isServiceRoleCall(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; }
  catch { return false; }
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!isServiceRoleCall(req)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    const { vendorOrderId } = await req.json();
    if (!vendorOrderId) throw new Error("Missing vendorOrderId");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: vendorOrder, error: vendorOrderError } = await supabase.from("vendor_orders").select("id, order_id, vendor_id, status").eq("id", vendorOrderId).single();
    if (vendorOrderError || !vendorOrder || vendorOrder.status !== "confirmed") throw new Error("Accepted order not found");
    const [{ data: vendor }, { data: order }, { data: adminRoles }] = await Promise.all([
      supabase.from("vendors").select("name").eq("id", vendorOrder.vendor_id).maybeSingle(),
      supabase.from("orders").select("id, customer_name, total").eq("id", vendorOrder.order_id).maybeSingle(),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
    ]);
    if (!vendor || !order) throw new Error("Order details not found");
    const adminEmails = (await Promise.all((adminRoles ?? []).map(async ({ user_id }) => {
      const { data, error } = await supabase.auth.admin.getUserById(user_id);
      return error ? null : data.user?.email ?? null;
    }))).filter((email): email is string => !!email);
    const orderNumber = order.id.slice(0, 8).toUpperCase();
    const body = emailTemplate({
      heading: "Boutique accepted an order",
      preheader: `${vendor.name} accepted order #${orderNumber}`,
      bodyHtml: `<p style="color:#5a5a5a;"><strong>${escapeHtml(vendor.name)}</strong> accepted order #${orderNumber} for ${escapeHtml(order.customer_name)} (${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(order.total))}).</p>`,
      ctaLabel: "View order in Admin",
      ctaUrl: `${SITE_URL}/admin?tab=orders&focus=${vendorOrder.id}`,
    });
    const results = await Promise.all(adminEmails.map((email) => sendEmail(email, `Boutique accepted order #${orderNumber} | AllBoutiqs`, body)));
    return new Response(JSON.stringify({ success: true, sent: results.length }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("send-vendor-order-accepted-email failed", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
