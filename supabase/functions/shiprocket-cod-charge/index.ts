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

// The Cash on Delivery fee the customer pays (client, 13 Nov 2026): 3% of
// what each boutique part comes to + 18% GST on that fee, per part - worked
// out by the database (cod_charge_for), the same way price_order does for
// the order itself. Shiprocket is still asked whether a courier collects
// cash for this parcel - from the warehouse (or, with warehouse routing off,
// each boutique) to the customer's PIN code, at the parcel's weight and
// value. Public like shiprocket-estimate-delivery: called from checkout
// before the order exists.
//
// Body: { delivery_pincode, order_value,
//         groups: [{ vendor_id, goods_due, items: [{ product_id, quantity }] }] }
// (goods_due: the part's goods less its coupon share plus its shipping; an
// older page that leaves it out gets the fee on order_value as one part.)
// Returns { available, cod_charge, cod_fee, cod_fee_gst, cod_fee_pct,
// courier_name } - cod_charge = fee + GST; available is false when no
// courier collects cash at that PIN code.
//
// Every quote given is recorded (cod_charge_quotes): a COD order is only
// accepted with a quote for exactly its pieces, PIN code and value
// (price_order).

const pick = (couriers: CourierOption[]) => couriers.find((c) => c.recommended) ?? couriers[0] ?? null;

// "<product id>:<quantity>,..." - quantities summed per product, sorted by
// product id. Must match price_order's items_key.
function itemsKey(items: { product_id: string; quantity: number }[]): string {
  const qty = new Map<string, number>();
  for (const i of items) qty.set(String(i.product_id), (qty.get(String(i.product_id)) ?? 0) + Number(i.quantity));
  return [...qty.keys()].sort().map((id) => `${id}:${qty.get(id)}`).join(",");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const deliveryPincode = String(body.delivery_pincode ?? "");
    const orderValue = Math.max(0, Number(body.order_value) || 0);
    const groups: { vendor_id: string; goods_due?: number; items: { product_id: string; quantity: number }[] }[] = Array.isArray(body.groups)
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

    // Does a courier collect cash for every parcel at this PIN code?
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
      courierName ??= courier.courierName;
    }

    // The fee: per boutique part when the page sent each part's amount due,
    // else on the whole order value.
    const partDues = groups.map((g) => Number(g.goods_due));
    const amounts = partDues.every((n) => Number.isFinite(n) && n >= 0)
      ? partDues.map((n) => Math.round(n * 100) / 100)
      : [Math.round(orderValue * 100) / 100];
    const { data: feeRows, error: feeErr } = await supabase.rpc("cod_charge_for", { _amounts: amounts });
    if (feeErr) throw feeErr;
    const fee = (Array.isArray(feeRows) ? feeRows[0] : feeRows) as
      | { fee: number; gst: number; total: number; fee_pct: number }
      | null;
    if (!fee) throw new Error("Couldn't work out the Cash on Delivery fee");
    const charge = Number(fee.total);

    const { error: quoteErr } = await supabase.from("cod_charge_quotes").insert({
      delivery_pincode: deliveryPincode,
      order_value: Math.round(orderValue * 100) / 100,
      items_key: itemsKey(allItems),
      cod_charge: charge,
    });
    if (quoteErr) throw quoteErr;
    return jsonResponse({
      available: true,
      cod_charge: charge,
      cod_fee: Number(fee.fee),
      cod_fee_gst: Number(fee.gst),
      cod_fee_pct: Number(fee.fee_pct),
      courier_name: courierName,
    });
  } catch (e) {
    console.error("shiprocket-cod-charge error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
