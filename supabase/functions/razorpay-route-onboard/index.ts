import { corsHeaders, jsonResponse, serviceClient, getCallerUserId, isAdmin, isVendorMember, errorMessage } from "../_shared/auth.ts";
import { onboardVendor } from "../_shared/razorpayRoute.ts";

// Boutique (or admin) saves bank details -> create/update its Razorpay
// linked account so payouts can be made automatically.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { vendor_id } = await req.json();
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
    const supabase = serviceClient();
    if (!(await isAdmin(supabase, userId)) && !(await isVendorMember(supabase, userId, vendor_id))) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }
    return jsonResponse(await onboardVendor(supabase, vendor_id));
  } catch (e) {
    console.error("razorpay-route-onboard error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
