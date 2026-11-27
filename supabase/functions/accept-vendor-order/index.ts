import { corsHeaders, errorMessage, jsonResponse, serviceClient } from "../_shared/auth.ts";
import { itemOptionsLabel } from "../_shared/itemOptions.ts";

// The website the email link and this page send the boutique to (live).
const SITE_URL = "https://allboutiqs.com";

// Confirm an order from the boutique's new-order email (one-time token).
//
// Only the boutique confirms an order (client, 27 Nov 2026: no order is ever
// confirmed on its own). This link used to confirm on a plain GET, so a mail
// scanner opening links to check them (Outlook Safe Links, Zoho, antivirus)
// could confirm an order nobody at the boutique had seen. Now:
//   GET  ?token=  -> redirect to the site's page /vendor/confirm-order, which
//                    shows the order and a Confirm order button (old emails'
//                    links land there too). Nothing changes on a GET.
//   POST { token, action: "check" }   -> the order and whether it can be confirmed
//   POST { token, action: "confirm" } -> confirms it (accept_vendor_order_from_email)

const TOKEN_RE = /^[a-f0-9]{64}$/;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method === "GET") {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    const target = `${SITE_URL}/vendor/confirm-order${TOKEN_RE.test(token) ? `?token=${token}` : ""}`;
    return new Response(null, {
      status: 302,
      headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "");
    const action = body.action === "confirm" ? "confirm" : "check";
    if (!TOKEN_RE.test(token)) return jsonResponse({ result: "invalid" });
    const tokenHash = await sha256(token);
    const supabase = serviceClient();

    if (action === "confirm") {
      const { data, error } = await supabase.rpc("accept_vendor_order_from_email", { _token_hash: tokenHash });
      if (error) throw error;
      // pending -> confirmed fires the customer's "confirmed" email and bell
      // and the admins' "boutique confirmed" email, as from the dashboard.
      const result = (data as { result?: string } | null)?.result ?? "invalid";
      return jsonResponse({ result: result === "already_used" ? "already_accepted" : result });
    }

    // check: read only - the token stays unused.
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("vendor_order_acceptance_tokens")
      .select("vendor_order_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (tokenErr) throw tokenErr;
    if (!tokenRow) return jsonResponse({ result: "invalid" });

    const { data: part, error: partErr } = await supabase
      .from("vendor_orders")
      .select("id, order_id, status, created_at")
      .eq("id", tokenRow.vendor_order_id)
      .maybeSingle();
    if (partErr) throw partErr;
    if (!part) return jsonResponse({ result: "invalid" });

    const { data: items } = await supabase
      .from("order_items")
      .select("product_title, variant_title, size, color, quantity")
      .eq("vendor_order_id", part.id);
    const order = {
      order_ref: `#${part.order_id.slice(0, 8).toUpperCase()}`,
      placed_at: part.created_at,
      items: (items ?? []).map((i) => ({ title: i.product_title, options: itemOptionsLabel(i), quantity: i.quantity })),
    };

    let result: string;
    if (part.status === "confirmed") result = "already_accepted";
    else if (part.status !== "pending") result = "not_pending";
    else if (tokenRow.used_at) result = "invalid";
    else if (new Date(tokenRow.expires_at).getTime() <= Date.now()) result = "expired";
    else result = "pending";
    return jsonResponse({ result, ...order });
  } catch (e) {
    console.error("accept-vendor-order failed", errorMessage(e));
    return jsonResponse({ error: "Something went wrong. Please confirm the order from the Seller Dashboard." }, 500);
  }
});
