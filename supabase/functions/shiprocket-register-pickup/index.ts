import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  getCallerUserId,
  isAdmin,
  isVendorMember,
  ensurePickupLocation,
  errorMessage,
} from "../_shared/shiprocket.ts";

// Registers a vendor's address as a Shiprocket pickup location so their
// orders can actually be shipped. Called lazily by shiprocket-create-shipment
// the first time a vendor ships, or explicitly by an admin/vendor action.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vendor_id } = await req.json();
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);

    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    const authorized = (await isAdmin(supabase, userId)) || (await isVendorMember(supabase, userId, vendor_id));
    if (!authorized) return jsonResponse({ error: "Forbidden" }, 403);

    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .select("id, slug, name, contact_email, contact_phone, address, shiprocket_pickup_location")
      .eq("id", vendor_id)
      .maybeSingle();
    if (vendorErr) throw vendorErr;
    if (!vendor) return jsonResponse({ error: "Vendor not found" }, 404);

    const alreadyRegistered = !!vendor.shiprocket_pickup_location;
    const pickupLocation = await ensurePickupLocation(supabase, vendor as any);

    return jsonResponse({ pickup_location: pickupLocation.name, already_registered: alreadyRegistered });
  } catch (e) {
    console.error("shiprocket-register-pickup error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
