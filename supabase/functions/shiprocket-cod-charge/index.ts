import {
  corsHeaders,
  jsonResponse,
  serviceClient,
  computeTotalWeightKg,
  checkCourierServiceability,
  errorMessage,
  type CourierOption,
} from "../_shared/shiprocket.ts";
import { getActiveDefaultWarehouse } from "../_shared/warehouse.ts";

// The Cash on Delivery charge the customer pays (Extra list M): Shiprocket's
// own COD charge for this order's parcel - from the warehouse (or, with
// warehouse routing off, each boutique) to the customer's PIN code, at the
// parcel's weight and value, with the courier the warehouse books by
// default (Shiprocket's recommended one). Public like
// shiprocket-estimate-delivery: called from checkout before the order exists.
//
// Body: { delivery_pincode, order_value, groups: [{ vendor_id, items: [{ product_id, quantity }] }] }
// Returns { available, cod_charge, courier_name } - available is false when
// no courier collects cash at that PIN code.

const pick = (couriers: CourierOption[]) => couriers.find((c) => c.recommended) ?? couriers[0] ?? null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const deliveryPincode = String(body.delivery_pincode ?? "");
    const orderValue = Math.max(0, Number(body.order_value) || 0);
    const groups: { vendor_id: string; items: { product_id: string; quantity: number }[] }[] = Array.isArray(body.groups)
      ? body.groups.filter((g: any) => g?.vendor_id && Array.isArray(g.items) && g.items.length > 0)
      : [];
    if (!/^[1-9][0-9]{5}$/.test(deliveryPincode) || groups.length === 0) {
      return jsonResponse({ error: "delivery_pincode and groups are required" }, 400);
    }
    const supabase = serviceClient();

    // Parcels: one from the warehouse with everything, or one per boutique.
    const warehouse = await getActiveDefaultWarehouse(supabase);
    const allItems = groups.flatMap((g) => g.items);
    const parcels: { pickupPincode: string; items: typeof allItems }[] = [];
    if (warehouse) {
      parcels.push({ pickupPincode: (warehouse.address as any)?.pincode ?? "", items: allItems });
    } else {
      const { data: vendors } = await supabase.from("vendors").select("id, address").in("id", groups.map((g) => g.vendor_id));
      for (const g of groups) {
        parcels.push({ pickupPincode: (vendors?.find((v) => v.id === g.vendor_id)?.address as any)?.pincode ?? "", items: g.items });
      }
    }
    const itemsValue = (items: typeof allItems) => {
      const total = allItems.reduce((s, i) => s + i.quantity, 0) || 1;
      return (orderValue * items.reduce((s, i) => s + i.quantity, 0)) / total;
    };

    let codCharge = 0;
    let courierName: string | null = null;
    for (const parcel of parcels) {
      if (!parcel.pickupPincode) return jsonResponse({ available: false, cod_charge: null });
      let couriers: CourierOption[];
      try {
        couriers = await checkCourierServiceability(supabase, {
          pickupPincode: parcel.pickupPincode,
          deliveryPincode,
          cod: true,
          weightKg: await computeTotalWeightKg(supabase, parcel.items),
          declaredValue: itemsValue(parcel.items),
        });
      } catch {
        return jsonResponse({ available: false, cod_charge: null });
      }
      const courier = pick(couriers);
      if (!courier) return jsonResponse({ available: false, cod_charge: null });
      codCharge += courier.codCharges;
      courierName ??= courier.courierName;
    }
    return jsonResponse({ available: true, cod_charge: Math.round(codCharge * 100) / 100, courier_name: courierName });
  } catch (e) {
    console.error("shiprocket-cod-charge error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
