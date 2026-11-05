import { corsHeaders, jsonResponse, serviceClient, getCallerUserId, isAdmin, shiprocketRequest, errorMessage } from "../_shared/shiprocket.ts";

const VALID_ACTIONS = ["re-attempt", "return"];

// Admin-only: decide what happens to a shipment stuck in NDR
// (non-delivery report, a failed delivery attempt) - try again, or send
// it back to the vendor. The resulting status change itself still comes
// through the webhook once Shiprocket actually acts on it; this just
// relays the decision.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { shipment_id, action, comments } = await req.json();
    if (!shipment_id || !action || !comments) {
      return jsonResponse({ error: "shipment_id, action, and comments are required" }, 400);
    }
    if (!VALID_ACTIONS.includes(action)) {
      return jsonResponse({ error: `action must be one of: ${VALID_ACTIONS.join(", ")}` }, 400);
    }

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    if (!(await isAdmin(supabase, userId))) return jsonResponse({ error: "Forbidden" }, 403);

    const { data: shipment, error: shipErr } = await supabase
      .from("shipments")
      .select("id, awb_code, status")
      .eq("id", shipment_id)
      .maybeSingle();
    if (shipErr) throw shipErr;
    if (!shipment) return jsonResponse({ error: "Shipment not found" }, 404);
    if (!shipment.awb_code) return jsonResponse({ error: "This shipment has no AWB yet" }, 400);

    const result = await shiprocketRequest(supabase, `/ndr/${shipment.awb_code}/action`, {
      method: "POST",
      body: { action, comments },
    });

    // Records who decided what and when, distinct from the courier's own
    // tracking events - both feed the same audit trail per shipment.
    await supabase.from("shipment_events").insert({
      shipment_id: shipment.id,
      awb_code: shipment.awb_code,
      event_status: `ndr_action:${action}`,
      activity: comments,
      event_timestamp: new Date().toISOString(),
      raw_payload: { requested_by: userId, action, comments, response: result },
    });

    return jsonResponse({ actioned: true, result });
  } catch (e) {
    console.error("shiprocket-ndr-action error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
