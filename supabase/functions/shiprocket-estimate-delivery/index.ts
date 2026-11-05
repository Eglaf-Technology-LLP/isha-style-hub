import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  computeTotalWeightKg,
  checkCourierServiceability,
  errorMessage,
} from "../_shared/shiprocket.ts";
import { EstimateGroup, estimateWarehouseDelivery, getActiveDefaultWarehouse } from "../_shared/warehouse.ts";

// Public - unlike every other Shiprocket function, this one is called
// pre-purchase from the product page and the cart, by anonymous shoppers
// as well as signed-in customers. No admin/vendor-membership check by
// design: it reveals nothing sensitive, just "is this pincode serviceable
// and at what rate/ETD" - the same thing Shiprocket's own site would tell
// anyone. Still runs under the platform's default JWT gate, satisfied
// automatically by the anon-key session every browser tab already has.
//
// Body: { delivery_pincode, vendor_id, items } for one boutique (product
// page), or { delivery_pincode, groups: [{ vendor_id, items }] } for a whole
// cart. While orders go through the warehouse the date is: slowest boutique
// (preparation + courier to the warehouse) + 1 working day at the warehouse +
// courier to the customer, and `couriers` are the warehouse -> customer ones.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const deliveryPincode: string | undefined = body.delivery_pincode;
    const groups: EstimateGroup[] = Array.isArray(body.groups)
      ? body.groups
          .filter((g: any) => g?.vendor_id && Array.isArray(g.items) && g.items.length > 0)
          .map((g: any) => ({ vendorId: g.vendor_id, items: g.items }))
      : body.vendor_id && Array.isArray(body.items) && body.items.length > 0
        ? [{ vendorId: body.vendor_id, items: body.items }]
        : [];
    if (!deliveryPincode || groups.length === 0) {
      return jsonResponse({ error: "delivery_pincode and vendor_id + items (or groups) are required" }, 400);
    }

    const supabase = serviceClient();

    const warehouse = await getActiveDefaultWarehouse(supabase);
    if (warehouse) {
      const estimate = await estimateWarehouseDelivery(supabase, warehouse, deliveryPincode, groups);
      return jsonResponse({
        available: estimate.available,
        couriers: estimate.lastMileCouriers,
        estimated_delivery_date: estimate.estimatedDeliveryDate,
        prep_days: estimate.prepDays,
        made_to_order: estimate.madeToOrder,
        reason: estimate.unavailableReason,
        via_warehouse: true,
      });
    }

    // Direct route (warehouse routing switched off): one boutique straight
    // to the customer, as before.
    const group = groups[0];
    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .select("address")
      .eq("id", group.vendorId)
      .maybeSingle();
    if (vendorErr) throw vendorErr;

    const pickupPincode = (vendor?.address as any)?.pincode;
    if (!pickupPincode) {
      // Vendor hasn't completed their pickup address yet - not an error,
      // just nothing to estimate. Never break page rendering over this.
      return jsonResponse({ available: false, couriers: [] });
    }

    const weightKg = await computeTotalWeightKg(supabase, group.items);

    let couriers;
    try {
      couriers = await checkCourierServiceability(supabase, {
        pickupPincode,
        deliveryPincode,
        cod: false,
        weightKg,
      });
    } catch {
      // Invalid pincode, not serviceable, etc. - a normal outcome for a
      // pre-purchase check, not a server error.
      return jsonResponse({ available: false, couriers: [] });
    }

    const etds = couriers
      .map((c) => (c.etd ? new Date(c.etd) : null))
      .filter((d): d is Date => !!d && !isNaN(d.getTime()));
    const earliest = etds.length ? new Date(Math.min(...etds.map((d) => d.getTime()))).toISOString().slice(0, 10) : null;

    return jsonResponse({ available: couriers.length > 0, couriers, estimated_delivery_date: earliest, via_warehouse: false });
  } catch (e) {
    console.error("shiprocket-estimate-delivery error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
