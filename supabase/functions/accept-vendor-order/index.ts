import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const htmlHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function page(title: string, message: string, status: number) {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | AllBoutiqs</title><body style="font-family:Arial,sans-serif;background:#f4efe9;color:#1a1a1a;margin:0;padding:32px"><main style="max-width:520px;margin:8vh auto;background:white;border-radius:12px;padding:32px;box-shadow:0 2px 10px #0001"><div style="color:#7a2e22;font-weight:bold;letter-spacing:.04em">ALLBOUTIQS</div><h1>${escape(title)}</h1><p style="line-height:1.6;color:#555">${escape(message)}</p><a href="https://allboutiqs.com/vendor" style="display:inline-block;background:#7a2e22;color:white;text-decoration:none;padding:12px 20px;border-radius:7px">Open Seller Dashboard</a></main></body></html>`, { status, headers: htmlHeaders });
}

serve(async (req) => {
  if (req.method !== "GET") return page("Link not valid", "Open the Accept order link from the boutique order email.", 405);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return page("Link not valid", "This order acceptance link is invalid. Open the latest order email or use the Seller Dashboard.", 400);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    const { data, error } = await supabase.rpc("accept_vendor_order_from_email", { _token_hash: tokenHash });
    if (error) throw error;
    const result = (data as { result?: string; vendor_order_id?: string; order_id?: string; vendor_id?: string } | null)?.result;
    if (result === "accepted") {
      // The transition fires the existing Admin bell trigger plus the
      // send-vendor-order-accepted-email trigger for all acceptance paths.
      return page("Order accepted", "Thank you. The order is confirmed, and the AllBoutiqs team has been notified.", 200);
    }
    if (result === "already_accepted" || result === "already_used") return page("Already accepted", "This order has already been accepted. No further action is needed.", 200);
    if (result === "expired") return page("Link expired", "This acceptance link expired. Please accept the order from the Seller Dashboard.", 410);
    if (result === "not_pending") return page("Order no longer pending", "This order can no longer be accepted from this link. Check the Seller Dashboard for its current status.", 409);
    return page("Link not valid", "This acceptance link is invalid. Open the latest order email or use the Seller Dashboard.", 400);
  } catch (error) {
    console.error("accept-vendor-order failed", error);
    return page("Couldn't accept this order", "Please open the Seller Dashboard and accept the order there, or contact AllBoutiqs support.", 500);
  }
});
