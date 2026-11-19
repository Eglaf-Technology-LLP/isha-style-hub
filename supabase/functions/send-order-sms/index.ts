import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDltTemplate, normalizeIndianPhone, renderDltBody, sendTwilioDltSms, type SmsAudience, type SmsEvent } from "../_shared/sms.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
type RequestBody = { orderId: string; event: SmsEvent; vendorOrderId?: string; returnRequestId?: string };

function serviceRoleCall(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; }
  catch { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (!serviceRoleCall(req)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
    const { orderId, event, vendorOrderId, returnRequestId }: RequestBody = await req.json();
    if (!orderId || !["placed", "shipped", "delivered", "cancelled", "return"].includes(event)) throw new Error("Invalid order SMS request");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: order, error: orderError } = await supabase.from("orders").select("id, customer_name, customer_phone, total, created_at").eq("id", orderId).single();
    if (orderError || !order) throw new Error("Order not found");
    const [{ data: items }, { data: vendorOrder }, { data: returnRequest }] = await Promise.all([
      supabase.from("order_items").select("id, product_title, size, quantity, vendor_id").eq("order_id", orderId),
      vendorOrderId ? supabase.from("vendor_orders").select("id, vendor_id").eq("id", vendorOrderId).maybeSingle() : Promise.resolve({ data: null }),
      returnRequestId ? supabase.from("return_requests").select("items").eq("id", returnRequestId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const orderNumber = order.id.slice(0, 8).toUpperCase();
    const shipByDate = new Date(new Date(order.created_at).getTime() + 3 * 86400000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    const base = event === "placed" ? [orderNumber, String(Math.round(Number(order.total)))] : [orderNumber];
    let boutiques: { vendor_id: string; name: string; contact_phone: string | null }[] = [];
    if (vendorOrder?.vendor_id) {
      const { data } = await supabase.from("vendors").select("id,name,contact_phone").eq("id", vendorOrder.vendor_id).maybeSingle();
      if (data) boutiques = [data];
    } else if (["placed", "shipped", "delivered", "cancelled"].includes(event)) {
      const vendorIds = [...new Set((items ?? []).map((item) => item.vendor_id).filter((id): id is string => !!id))];
      if (vendorIds.length) {
        const { data } = await supabase.from("vendors").select("id,name,contact_phone").in("id", vendorIds);
        boutiques = data ?? [];
      }
    } else if (event === "return") {
      const returnedItemIds = ((returnRequest?.items ?? []) as { order_item_id?: string }[]).map((item) => item.order_item_id).filter((id): id is string => !!id);
      const affectedVendorIds = [...new Set((items ?? []).filter((item) => returnedItemIds.includes(item.id)).map((item) => item.vendor_id).filter((id): id is string => !!id))];
      if (affectedVendorIds.length) {
        const { data } = await supabase.from("vendors").select("id,name,contact_phone").in("id", affectedVendorIds);
        boutiques = data ?? [];
      }
    }
    if (boutiques.length === 0) boutiques = [{ vendor_id: "", name: "Boutique", contact_phone: null }];
    const destinations: { audience: SmsAudience; phone: string | null; variables: string[] }[] = [
      { audience: "customer", phone: normalizeIndianPhone(order.customer_phone), variables: base },
      ...boutiques.map((boutique) => {
        const firstItem = (items ?? []).find((item) => item.vendor_id === boutique.vendor_id);
        return { audience: "boutique" as const, phone: normalizeIndianPhone(boutique.contact_phone), variables: event === "placed" ? [orderNumber, firstItem?.product_title ?? "Order", firstItem?.size ?? "N/A", shipByDate] : [orderNumber] };
      }),
      ...((Deno.env.get("SMS_ADMIN_PHONES") ?? "").split(",").map((phone) => ({ audience: "admin" as const, phone: normalizeIndianPhone(phone), variables: event === "placed" ? [orderNumber, String(Math.round(Number(order.total)))] : [orderNumber] }))),
    ];
    const results = await Promise.all(destinations.map(async ({ audience, phone, variables }) => {
      let template: ReturnType<typeof getDltTemplate> = null;
      let messageBody: string | null = null;
      let templateError: string | null = null;
      try {
        template = getDltTemplate(event, audience);
        if (!template) throw new Error(`DLT template is not configured for ${event}/${audience}`);
        messageBody = renderDltBody(template.body, variables);
      } catch (error) {
        templateError = error instanceof Error ? error.message : String(error);
      }
      const { data: log, error: logError } = await supabase.from("order_sms_logs").insert({
        order_id: orderId, vendor_order_id: vendorOrderId ?? null, return_request_id: returnRequestId ?? null,
        event, audience, phone: phone ?? "", template_id: template?.id ?? null, message_body: messageBody, variables, status: "pending",
      }).select("id").single();
      if (logError) throw logError;
      let status = "failed", providerMessageId: string | null = null, errorMessage: string | null = null, providerResponse: unknown = null;
      try {
        if (!phone) throw new Error(`${audience} phone number is missing or invalid`);
        if (templateError) throw new Error(templateError);
        const result = await sendTwilioDltSms(template!.id, phone, messageBody!);
        providerResponse = result.response;
        const parsed = result.response as { sid?: string; status?: string };
        status = "accepted";
        providerMessageId = parsed?.sid ?? null;
      } catch (error) { errorMessage = error instanceof Error ? error.message : String(error); }
      await supabase.from("order_sms_logs").update({ status, provider_message_id: providerMessageId, error_message: errorMessage, provider_response: providerResponse, accepted_at: status === "accepted" ? new Date().toISOString() : null }).eq("id", log.id);
      return { audience, status, error: errorMessage };
    }));
    return new Response(JSON.stringify({ success: results.every((r) => r.status === "accepted"), results }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
  } catch (error) {
    console.error("send-order-sms failed", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
  }
});
