import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  checkCourierServiceability,
  computeTotalWeightKg,
  Consignee,
  CourierOption,
  routeTransitDays,
  WAREHOUSE_COLUMNS,
  WarehouseRow,
} from "./shiprocket.ts";

// Warehouse route (requirement #19): boutique -> AllBoutiqs warehouse ->
// customer, returns back through the warehouse. Shared by the Shiprocket
// functions, the courier webhook and warehouse-actions.

export interface WarehouseSettings {
  routingEnabled: boolean;
  defaultPrepDays: number;
  handlingDays: number;
  cutoffHour: number;
  maxWaitDays: number;
  inboundTransitDays: number;
}

export async function loadWarehouseSettings(supabase: SupabaseClient): Promise<WarehouseSettings> {
  const { data } = await supabase
    .from("platform_settings")
    .select(
      "warehouse_routing_enabled, default_prep_days, warehouse_handling_days, warehouse_cutoff_hour, warehouse_max_wait_days, warehouse_inbound_transit_days",
    )
    .maybeSingle();
  return {
    routingEnabled: data?.warehouse_routing_enabled ?? true,
    defaultPrepDays: data?.default_prep_days ?? 2,
    handlingDays: data?.warehouse_handling_days ?? 1,
    cutoffHour: data?.warehouse_cutoff_hour ?? 17,
    maxWaitDays: data?.warehouse_max_wait_days ?? 3,
    inboundTransitDays: data?.warehouse_inbound_transit_days ?? 3,
  };
}

export async function getWarehouse(supabase: SupabaseClient, warehouseId: string): Promise<WarehouseRow> {
  const { data, error } = await supabase.from("warehouses").select(WAREHOUSE_COLUMNS).eq("id", warehouseId).single();
  if (error) throw error;
  return data as WarehouseRow;
}

// The warehouse new orders are routed to, or null when routing is off.
export async function getActiveDefaultWarehouse(supabase: SupabaseClient): Promise<WarehouseRow | null> {
  const settings = await loadWarehouseSettings(supabase);
  if (!settings.routingEnabled) return null;
  const { data } = await supabase
    .from("warehouses")
    .select(WAREHOUSE_COLUMNS)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();
  return (data as WarehouseRow) ?? null;
}

export function warehouseConsignee(w: WarehouseRow): Consignee {
  return {
    name: `${w.name} (${w.contact_name})`,
    email: w.contact_email,
    phone: w.contact_phone,
    address: w.address,
  };
}

// ---------- working days (Sundays and warehouse holidays don't count) ----------

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istToday(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function addCalendarDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function loadHolidays(supabase: SupabaseClient): Promise<Set<string>> {
  const today = istToday();
  const { data } = await supabase
    .from("warehouse_holidays")
    .select("holiday_date")
    .gte("holiday_date", today)
    .lte("holiday_date", addCalendarDays(today, 180));
  return new Set((data ?? []).map((h: { holiday_date: string }) => h.holiday_date));
}

function isWorkingDay(isoDate: string, holidays: Set<string>): boolean {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay() !== 0 && !holidays.has(isoDate);
}

export function addWorkingDays(isoDate: string, n: number, holidays: Set<string>): string {
  let d = isoDate;
  let added = 0;
  while (added < n) {
    d = addCalendarDays(d, 1);
    if (isWorkingDay(d, holidays)) added++;
  }
  return d;
}

// ---------- delivery estimate on the warehouse route ----------

export interface EstimateGroup {
  vendorId: string;
  items: { product_id: string; quantity: number }[];
}

export interface WarehouseEstimate {
  available: boolean;
  estimatedDeliveryDate: string | null;
  // Longest preparation time across the items (days), and whether any item
  // is made to order - for "Made to order: ships in N days".
  prepDays: number;
  madeToOrder: boolean;
  // Warehouse -> customer couriers (rates for the cart's shipping estimate).
  lastMileCouriers: CourierOption[];
  unavailableReason: string | null;
}

// Estimate = slowest boutique (preparation + courier to the warehouse) + the
// warehouse's handling days + courier from the warehouse to the customer.
export async function estimateWarehouseDelivery(
  supabase: SupabaseClient,
  warehouse: WarehouseRow,
  deliveryPincode: string,
  groups: EstimateGroup[],
): Promise<WarehouseEstimate> {
  const settings = await loadWarehouseSettings(supabase);
  const holidays = await loadHolidays(supabase);
  const warehousePincode = warehouse.address.pincode ?? "";
  const unavailable = (reason: string): WarehouseEstimate => ({
    available: false,
    estimatedDeliveryDate: null,
    prepDays: 0,
    madeToOrder: false,
    lastMileCouriers: [],
    unavailableReason: reason,
  });

  const vendorIds = [...new Set(groups.map((g) => g.vendorId))];
  const productIds = [...new Set(groups.flatMap((g) => g.items.map((i) => i.product_id)))];
  const [{ data: vendors }, { data: products }] = await Promise.all([
    supabase.from("vendors").select("id, address, default_prep_days").in("id", vendorIds),
    supabase.from("products").select("id, prep_days, made_to_order").in("id", productIds),
  ]);
  const vendorById = new Map((vendors ?? []).map((v: any) => [v.id, v]));
  const productById = new Map((products ?? []).map((p: any) => [p.id, p]));

  const today = istToday();
  let latestArrival = today;
  let maxPrep = 0;
  let madeToOrder = false;

  for (const group of groups) {
    const vendor = vendorById.get(group.vendorId);
    const pickupPincode = vendor?.address?.pincode;
    if (!pickupPincode) return unavailable("This boutique hasn't set its pickup address yet");

    const prep = Math.max(
      0,
      ...group.items.map((i) => {
        const p = productById.get(i.product_id);
        if (p?.made_to_order) madeToOrder = true;
        return p?.prep_days ?? vendor?.default_prep_days ?? settings.defaultPrepDays;
      }),
    );
    maxPrep = Math.max(maxPrep, prep);

    let inboundDays = settings.inboundTransitDays;
    try {
      const weightKg = await computeTotalWeightKg(supabase, group.items);
      const inbound = await checkCourierServiceability(supabase, {
        pickupPincode,
        deliveryPincode: warehousePincode,
        cod: false,
        weightKg,
      });
      if (inbound.length === 0) return unavailable("No courier currently connects this boutique to our warehouse");
      inboundDays = routeTransitDays(inbound) ?? inboundDays;
    } catch {
      return unavailable("No courier currently connects this boutique to our warehouse");
    }

    const readyOn = addWorkingDays(today, prep, holidays);
    const arrival = addCalendarDays(readyOn, inboundDays);
    if (arrival > latestArrival) latestArrival = arrival;
  }

  let lastMile: CourierOption[] = [];
  try {
    const weightKg = await computeTotalWeightKg(supabase, groups.flatMap((g) => g.items));
    lastMile = await checkCourierServiceability(supabase, {
      pickupPincode: warehousePincode,
      deliveryPincode,
      cod: false,
      weightKg,
    });
  } catch {
    return unavailable("Not deliverable to this pincode");
  }
  if (lastMile.length === 0) return unavailable("Not deliverable to this pincode");

  // The parcel may arrive on a Sunday or holiday; handling starts on the next
  // working day either way.
  const dispatchOn = addWorkingDays(latestArrival, settings.handlingDays, holidays);
  const outboundDays = routeTransitDays(lastMile) ?? 3;

  return {
    available: true,
    estimatedDeliveryDate: addCalendarDays(dispatchOn, outboundDays),
    prepDays: maxPrep,
    madeToOrder,
    lastMileCouriers: lastMile,
    unavailableReason: null,
  };
}

// ---------- item lines for bookings ----------

export interface BookingLine {
  order_item_id: string;
  product_id: string;
  variant_id: string | null;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  price: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Order lines as Shiprocket items, resolving a SKU the same way Ship Now does
// (variant SKU, then product SKU, then the order line's own id).
export async function toShiprocketItems(supabase: SupabaseClient, lines: BookingLine[]) {
  const productIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean))];
  const variantIds = [...new Set(lines.map((l) => l.variant_id).filter((id): id is string => !!id && UUID_RE.test(id)))];
  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length ? supabase.from("products").select("id, sku").in("id", productIds) : Promise.resolve({ data: [] }),
    variantIds.length ? supabase.from("product_variants").select("id, sku").in("id", variantIds) : Promise.resolve({ data: [] }),
  ]);
  const productSku = new Map((products ?? []).map((p: any) => [p.id, p.sku]));
  const variantSku = new Map((variants ?? []).map((v: any) => [v.id, v.sku]));
  return lines.map((l) => ({
    name: l.variant_title ? `${l.product_title} (${l.variant_title})` : l.product_title,
    sku: l.sku || (l.variant_id ? variantSku.get(l.variant_id) : null) || productSku.get(l.product_id) || l.order_item_id,
    units: l.quantity,
    selling_price: Number(l.price ?? 0),
  }));
}

export const PARCEL_DEFAULTS = { lengthCm: 25, breadthCm: 20, heightCm: 5 };
