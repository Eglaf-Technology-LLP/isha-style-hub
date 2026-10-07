import { corsHeaders, jsonResponse, serviceClient, getCallerUserId, isAdmin, errorMessage } from "../_shared/auth.ts";
import { releaseDuePayouts } from "../_shared/razorpayRoute.ts";

function isServiceRoleCall(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    return JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

// Daily cron (via invoke_edge_function) or the admin "Release due payouts
// now" button: pays out every boutique order whose payout date has arrived.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = serviceClient();
    if (!isServiceRoleCall(req)) {
      const userId = await getCallerUserId(req);
      if (!userId || !(await isAdmin(supabase, userId))) return jsonResponse({ error: "Forbidden" }, 403);
    }
    return jsonResponse(await releaseDuePayouts(supabase));
  } catch (e) {
    console.error("razorpay-route-release error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
