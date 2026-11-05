import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  canBookReturnPickup,
  errorMessage,
} from "../_shared/shiprocket.ts";
import { bookReversePickup, ReversePickupError } from "../_shared/reversePickup.ts";

// Booked when a return request is approved: the courier pickup from the
// customer to the AllBoutiqs warehouse (the default on warehouse orders), or
// straight to the boutique when the admin chose that.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { return_request_id } = await req.json();
    if (!return_request_id) return jsonResponse({ error: "return_request_id is required" }, 400);

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    if (!(await canBookReturnPickup(supabase, userId, return_request_id))) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: rr } = await supabase.from("return_requests").select("request_type").eq("id", return_request_id).maybeSingle();
    if (!rr) return jsonResponse({ error: "Return request not found" }, 404);
    if (rr.request_type !== "return") {
      return jsonResponse({ error: "This is an exchange request - use shiprocket-create-exchange instead" }, 400);
    }

    const { shipment, alreadyScheduled } = await bookReversePickup(supabase, return_request_id);
    return jsonResponse({ shipment, already_scheduled: alreadyScheduled });
  } catch (e) {
    console.error("shiprocket-create-return error", e);
    return jsonResponse({ error: errorMessage(e) }, e instanceof ReversePickupError ? 400 : 500);
  }
});
