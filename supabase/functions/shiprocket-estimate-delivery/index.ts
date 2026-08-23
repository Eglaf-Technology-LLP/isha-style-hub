import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  computeTotalWeightKg,
  checkCourierServiceability,
  errorMessage,
} from "../_shared/shiprocket.ts";

// Public - unlike every other Shiprocket function, this one is called
// pre-purchase from the product page and the cart, by anonymous shoppers
// as well as signed-in customers. No admin/vendor-membership check by
// design: it reveals nothing sensitive, just "is this pincode serviceable
// and at what rate/ETD" - the same thing Shiprocket's own site would tell
// anyone. Still runs under the platform's default JWT gate, satisfied
// automatically by the anon-key session every browser tab already has.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vendor_id, delivery_pincode, items } = await req.json();
    if (!vendor_id || !delivery_pincode || !Array.isArray(items) || items.length === 0) {
      return jsonResponse({ error: "vendor_id, delivery_pincode, and items are required" }, 400);
    }

    const supabase = serviceClient();

    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .select("address")
      .eq("id", vendor_id)
      .maybeSingle();
    if (vendorErr) throw vendorErr;

    const pickupPincode = (vendor?.address as any)?.pincode;
    if (!pickupPincode) {
      // Vendor hasn't completed their pickup address yet - not an error,
      // just nothing to estimate. Never break page rendering over this.
      return jsonResponse({ available: false, couriers: [] });
    }

    const weightKg = await computeTotalWeightKg(supabase, items);

    let couriers;
    try {
      couriers = await checkCourierServiceability(supabase, {
        pickupPincode,
        deliveryPincode: delivery_pincode,
        cod: false,
        weightKg,
      });
    } catch {
      // Invalid pincode, not serviceable, etc. - a normal outcome for a
      // pre-purchase check, not a server error.
      return jsonResponse({ available: false, couriers: [] });
    }

    return jsonResponse({ available: couriers.length > 0, couriers });
  } catch (e) {
    console.error("shiprocket-estimate-delivery error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
