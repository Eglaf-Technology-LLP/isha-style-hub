import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { AppError, errorMessage, serviceClient, getCallerUserId, isAdmin, isVendorMember, corsHeaders, jsonResponse } from "./auth.ts";

const BASE_URL = "https://apiv2.shiprocket.in/v1/external";

// Re-exported so every existing `from "../_shared/shiprocket.ts"` import in
// the shiprocket-* functions keeps working unchanged - these now live in
// ./auth.ts since they're generic (used by create-razorpay-refund too).
export { errorMessage, serviceClient, getCallerUserId, isAdmin, isVendorMember, corsHeaders, jsonResponse };

export class ShiprocketError extends AppError {}

// Shiprocket's own bearer token is valid ~240 hours (10 days). Cached in
// a single-row, service-role-only table so we don't re-authenticate on
// every function call - re-logging in per call risks the same kind of
// send/auth rate limit already hit once this project with Supabase's own
// signup endpoint.
export async function getValidToken(supabase: SupabaseClient): Promise<string> {
  const { data: cached } = await supabase
    .from("shiprocket_tokens")
    .select("token, expires_at")
    .eq("id", 1)
    .maybeSingle();

  const oneDayMs = 24 * 60 * 60 * 1000;
  if (cached && new Date(cached.expires_at).getTime() - Date.now() > oneDayMs) {
    return cached.token;
  }

  const email = Deno.env.get("SHIPROCKET_EMAIL");
  const password = Deno.env.get("SHIPROCKET_PASSWORD");
  if (!email || !password) {
    throw new Error("SHIPROCKET_EMAIL/SHIPROCKET_PASSWORD not configured");
  }

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok || !body.token) {
    console.error("Shiprocket auth failed", res.status, body);
    throw new ShiprocketError(res.status, "Shiprocket authentication failed", body);
  }

  const expiresAt = new Date(Date.now() + 239 * 60 * 60 * 1000).toISOString(); // 239h, 1h safety margin under their 240h
  await supabase
    .from("shiprocket_tokens")
    .upsert({ id: 1, token: body.token, expires_at: expiresAt, updated_at: new Date().toISOString() });

  return body.token;
}

// Thin authenticated wrapper around every Shiprocket call - callers pass
// the path relative to /v1/external and get back the parsed JSON body,
// or a ShiprocketError carrying the real status/body for the caller to
// decide how to surface.
export async function shiprocketRequest(
  supabase: SupabaseClient,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<any> {
  const token = await getValidToken(supabase);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Shiprocket API error", path, res.status, body);
    throw new ShiprocketError(res.status, `Shiprocket ${path} failed`, body);
  }
  return body;
}

export interface CoarseStatus {
  shipmentStatus: string; // shipments.status enum value
  vendorOrderStatus: string | null; // vendor_orders.status value, or null to leave untouched (return-leg shipments)
}

// Shiprocket exposes status through at least three inconsistent numeric
// schemes across different API surfaces (per-scan "sr-status", order-level
// "status_code", and the webhook's own "current_status_id"/
// "shipment_status_id" - confirmed by reading real examples across their
// docs, not assumed). The human-readable status STRING is far more
// consistent, so that's the map key here. Anything not recognized falls
// into a safe non-terminal default rather than being silently dropped -
// the raw string and the full webhook payload are always persisted
// regardless (see shipment_events), so the map can be extended from real
// data as new statuses are actually seen.
const STATUS_MAP: Record<string, CoarseStatus> = {
  "NEW": { shipmentStatus: "pending", vendorOrderStatus: "confirmed" },
  "MANIFEST GENERATED": { shipmentStatus: "awb_assigned", vendorOrderStatus: "confirmed" },
  "OUT FOR PICKUP": { shipmentStatus: "pickup_scheduled", vendorOrderStatus: "confirmed" },
  "PICKED UP": { shipmentStatus: "picked_up", vendorOrderStatus: "processing" },
  "SHIPPED": { shipmentStatus: "in_transit", vendorOrderStatus: "shipped" },
  "IN TRANSIT": { shipmentStatus: "in_transit", vendorOrderStatus: "shipped" },
  "REACHED AT DESTINATION HUB": { shipmentStatus: "in_transit", vendorOrderStatus: "shipped" },
  "OUT FOR DELIVERY": { shipmentStatus: "out_for_delivery", vendorOrderStatus: "out_for_delivery" },
  "DELIVERED": { shipmentStatus: "delivered", vendorOrderStatus: "delivered" },
  "UNDELIVERED": { shipmentStatus: "ndr", vendorOrderStatus: "ndr" },
  // A courier-side cancellation (e.g. Shiprocket auto-cancelling after
  // repeated failed pickups) kills the booking, not the customer's order -
  // same rule as shiprocket-cancel-shipment. The order stays shippable so
  // the vendor can book again; a real order cancellation only ever comes
  // from cancel-order-items, with its own refund handling.
  "CANCELED": { shipmentStatus: "cancelled", vendorOrderStatus: null },
  "CANCELLED": { shipmentStatus: "cancelled", vendorOrderStatus: null },
  "RETURN PENDING": { shipmentStatus: "pending", vendorOrderStatus: null },
  "LOST": { shipmentStatus: "lost", vendorOrderStatus: null },
};

const DEFAULT_STATUS: CoarseStatus = { shipmentStatus: "in_transit", vendorOrderStatus: null };

export function mapShiprocketStatus(rawStatus: string): CoarseStatus {
  const normalized = (rawStatus || "").trim().toUpperCase();
  if (STATUS_MAP[normalized]) return STATUS_MAP[normalized];
  if (normalized.includes("RTO")) return { shipmentStatus: "rto", vendorOrderStatus: "returned" };
  if (normalized.includes("NDR")) return { shipmentStatus: "ndr", vendorOrderStatus: "ndr" };
  // Shiprocket's activity labels are free text ("Shipment Cancelled - User
  // Reason : Auto Cancelled By Sr"), not the bare CANCELED key above, so a
  // cancellation has to be matched by substring or it silently falls through
  // to in_transit and the vendor still sees the last pickup-stage status.
  if (normalized.includes("CANCEL")) return { shipmentStatus: "cancelled", vendorOrderStatus: null };
  // "Pickup Scheduled", "Manifest Generated And Pickup Scheduled", "Pickup
  // Exception", "Pickup Rescheduled"... - nothing has left the vendor yet,
  // so these must not fall through to the in_transit default. ("PICKED UP"
  // is matched exactly above and doesn't contain "PICKUP".)
  if (normalized.includes("PICKUP")) return { shipmentStatus: "pickup_scheduled", vendorOrderStatus: null };
  return DEFAULT_STATUS;
}

export interface VendorAddress {
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

// Registers a vendor's address as a Shiprocket pickup location if it
// isn't already, adopting an existing same-named registration if a
// prior attempt partially succeeded. Returns the pickup location name.
// Shared between the standalone registration function and "Ship Now",
// which needs this to happen inline the first time a vendor ships.
export interface PickupLocation {
  name: string;
  id: number | null;
}

export async function ensurePickupLocation(
  supabase: SupabaseClient,
  vendor: {
    id: string;
    slug: string;
    name: string;
    contact_email: string | null;
    contact_phone: string | null;
    address: VendorAddress | null;
    shiprocket_pickup_location: string | null;
    shiprocket_pickup_id?: number | null;
  },
): Promise<PickupLocation> {
  return registerPickupLocation(supabase, {
    table: "vendors",
    id: vendor.id,
    baseName: vendor.slug,
    name: vendor.name,
    email: vendor.contact_email,
    phone: vendor.contact_phone,
    address: vendor.address,
    registered: vendor.shiprocket_pickup_location,
    registeredId: vendor.shiprocket_pickup_id ?? null,
    label: "Vendor",
  });
}

export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address: VendorAddress;
  shiprocket_pickup_location: string | null;
  shiprocket_pickup_id: number | null;
}

export const WAREHOUSE_COLUMNS =
  "id, code, name, contact_name, contact_phone, contact_email, address, shiprocket_pickup_location, shiprocket_pickup_id";

// The AllBoutiqs warehouse as a Shiprocket pickup location - parcels to the
// customer and back to boutiques leave from here.
export async function ensureWarehousePickupLocation(
  supabase: SupabaseClient,
  warehouse: WarehouseRow,
): Promise<PickupLocation> {
  return registerPickupLocation(supabase, {
    table: "warehouses",
    id: warehouse.id,
    baseName: `allboutiqs-${warehouse.code.toLowerCase()}`,
    // Shiprocket prints this as the sender on the label.
    name: warehouse.contact_name,
    email: warehouse.contact_email,
    phone: warehouse.contact_phone,
    address: warehouse.address,
    registered: warehouse.shiprocket_pickup_location,
    registeredId: warehouse.shiprocket_pickup_id,
    label: "Warehouse",
  });
}

async function registerPickupLocation(
  supabase: SupabaseClient,
  entity: {
    table: "vendors" | "warehouses";
    id: string;
    baseName: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: VendorAddress | null;
    registered: string | null;
    registeredId: number | null;
    label: string;
  },
): Promise<PickupLocation> {
  if (entity.registered) {
    return { name: entity.registered, id: entity.registeredId };
  }

  const address = entity.address ?? {};
  const missing = ["address_line1", "city", "state", "pincode"].filter(
    (f) => !(address as Record<string, string>)[f]?.trim(),
  );
  if (missing.length > 0 || !entity.phone?.trim()) {
    throw new Error(
      `${entity.label} address is incomplete - missing: ${[...missing, ...(!entity.phone?.trim() ? ["contact_phone"] : [])].join(", ")}`,
    );
  }

  const existing = await shiprocketRequest(supabase, "/settings/company/pickup");
  const existingLocations: any[] = existing?.data?.shipping_address ?? [];
  const baseName = entity.baseName;
  const sameName = existingLocations.find((p) => p.pickup_location === baseName);

  // Shiprocket has no "update pickup address" API at all (confirmed
  // absent from their full endpoint list) - only create and list. So a
  // same-named registration is only safe to reuse if its address still
  // actually matches; otherwise it's a stale leftover from before the
  // vendor's address changed, and reusing it would silently ship from
  // the wrong address. Confirmed live: exactly this happened for a real
  // vendor after they corrected their pincode in Store Settings.
  const addressMatches = (loc: any) =>
    (loc.pin_code || "") === (address.pincode || "").trim() &&
    (loc.address || "") === (address.address_line1 || "").trim();

  let pickupLocationName = baseName;
  let pickupId: number | null = null;

  if (sameName && addressMatches(sameName)) {
    pickupId = toIntOrNull(sameName.id);
  } else {
    if (sameName) {
      // Base name is taken by a stale address - disambiguate rather
      // than silently pointing at it or erroring out.
      const takenNames = new Set(existingLocations.map((p) => p.pickup_location));
      let suffix = 2;
      while (takenNames.has(`${baseName}-${suffix}`)) suffix++;
      pickupLocationName = `${baseName}-${suffix}`;
    }
    const created = await shiprocketRequest(supabase, "/settings/company/addpickup", {
      method: "POST",
      body: {
        pickup_location: pickupLocationName,
        name: entity.name,
        email: entity.email || "orders@allboutiqs.com",
        phone: entity.phone,
        address: address.address_line1,
        address_2: address.address_line2 || "",
        city: address.city,
        state: address.state,
        country: address.country || "India",
        pin_code: address.pincode,
      },
    });
    pickupId = toIntOrNull(created?.pickup_id ?? created?.address?.id);
  }

  const { error } = await supabase
    .from(entity.table)
    .update({
      shiprocket_pickup_location: pickupLocationName,
      shiprocket_pickup_id: pickupId,
      shiprocket_pickup_registered_at: new Date().toISOString(),
    })
    .eq("id", entity.id);
  if (error) throw error;

  return { name: pickupLocationName, id: pickupId };
}

// Shiprocket's webhook `current_timestamp` field is "DD MM YYYY HH:mm:ss"
// (confirmed against a real sample payload from their own docs) -
// inconsistent with every OTHER date field in the very same payload
// (pickup_scheduled_date etc use "YYYY-MM-DD HH:mm:ss"). Confirmed live:
// naively treating it as ISO-ish throws "Invalid time value" and 500s the
// whole webhook. Never throws here - falls back to "now" on any
// unrecognized shape so a formatting surprise never drops a tracking event.
export function parseShiprocketTimestamp(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();

  const ddMmYyyy = raw.match(/^(\d{2}) (\d{2}) (\d{4}) (\d{2}:\d{2}:\d{2})$/);
  if (ddMmYyyy) {
    const [, dd, mm, yyyy, time] = ddMmYyyy;
    const parsed = new Date(`${yyyy}-${mm}-${dd}T${time}`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const isoAttempt = new Date(raw.replace(" ", "T"));
  if (!isNaN(isoAttempt.getTime())) return isoAttempt.toISOString();

  console.error("parseShiprocketTimestamp: unrecognized format, using now()", raw);
  return new Date().toISOString();
}

// Parcel weight default used whenever a product hasn't set its own -
// reasonable for folded apparel. Never blocks a serviceability check or a
// real shipment on missing data. Shared by both the courier-rate check
// and the actual "Ship Now" booking so they always agree on weight.
export const DEFAULT_ITEM_WEIGHT_GRAMS = 300;

export async function computeTotalWeightKg(
  supabase: SupabaseClient,
  items: { product_id: string; quantity: number }[],
): Promise<number> {
  const productIds = items.map((i) => i.product_id).filter(Boolean);
  const { data: products } = await supabase.from("products").select("id, weight_grams").in("id", productIds);
  const weightByProductId = new Map((products ?? []).map((p) => [p.id, p.weight_grams]));
  const totalGrams = items.reduce((sum, item) => {
    const perUnit = weightByProductId.get(item.product_id) ?? DEFAULT_ITEM_WEIGHT_GRAMS;
    return sum + perUnit * item.quantity;
  }, 0);
  return Math.max(totalGrams / 1000, 0.1);
}

export interface CourierOption {
  courierId: number;
  courierName: string;
  // Full breakdown, all straight from Shiprocket's own response - a vendor
  // pulling up Shiprocket's own rate calculator for the same route should
  // see these exact same component numbers, not just a single total that
  // can't be cross-checked. freightCharge + codCharges + serviceFee = rate.
  freightCharge: number;
  codCharges: number;
  // Shiprocket's own dashboard shows this as a separate "Smart Order" line
  // (their real per-shipment SMS/tracking-update service) on top of
  // freight - their `/courier/serviceability` response calls the same
  // number `whatsapp_charges` and it is NOT folded into their own `rate`
  // field, so it has to be added in here or the total silently understates
  // what a vendor will see if they check Shiprocket's calculator directly
  // (confirmed by reconciling a real example: 47.36 freight + 5 service =
  // 52.36, exactly matching Shiprocket's own displayed total for that route).
  serviceFee: number;
  rate: number;
  // Shiprocket's own 0-5 reliability rating for this courier on this route
  // (their "Radar" system) - null if they didn't return one.
  rating: number | null;
  // Shiprocket's own API returns couriers in their own recommended order
  // (confirmed: their dashboard's "Recommended" badge sits on whichever
  // courier is first in this same response) - captured before this
  // function's own price sort reorders the list for display.
  recommended: boolean;
  etd: string | null;
  // Courier days door to door, from Shiprocket's estimated_delivery_days (or
  // worked out from etd) - what the warehouse-route delivery estimate adds up.
  estimatedDays: number | null;
}

function courierDays(c: any): number | null {
  const days = Number(c.estimated_delivery_days);
  if (Number.isFinite(days) && days > 0) return Math.round(days);
  if (c.etd) {
    const etd = new Date(c.etd);
    if (!isNaN(etd.getTime())) {
      const diff = Math.ceil((etd.getTime() - Date.now()) / 86_400_000);
      if (diff > 0) return diff;
    }
  }
  return null;
}

// Real courier names/rates/ETDs for this pickup->delivery route, straight
// from Shiprocket's own serviceability check - lets the vendor actually
// pick a courier and see the fare instead of Shiprocket auto-assigning
// one silently. Sorted cheapest first (their own recommendation is kept
// as a separate flag rather than dictating the display order).
export async function checkCourierServiceability(
  supabase: SupabaseClient,
  // declaredValue: the parcel's value - a courier's COD charge is usually a
  // share of the amount collected, so it's needed for a true COD rate.
  params: { pickupPincode: string; deliveryPincode: string; cod: boolean; weightKg: number; declaredValue?: number },
): Promise<CourierOption[]> {
  const result = await shiprocketRequest(
    supabase,
    `/courier/serviceability/?pickup_postcode=${encodeURIComponent(params.pickupPincode)}` +
      `&delivery_postcode=${encodeURIComponent(params.deliveryPincode)}` +
      `&cod=${params.cod ? 1 : 0}&weight=${params.weightKg}` +
      (params.declaredValue ? `&declared_value=${Math.ceil(params.declaredValue)}` : ""),
  );

  const companies = result?.data?.available_courier_companies ?? [];
  const options: CourierOption[] = companies
    .filter((c: any) => !c.blocked)
    .map((c: any, index: number) => {
      const freightCharge = Number(c.freight_charge ?? 0);
      const codCharges = Number(c.cod_charges ?? 0);
      const serviceFee = Number(c.whatsapp_charges ?? 0);
      return {
        courierId: c.courier_company_id,
        courierName: c.courier_name,
        freightCharge,
        codCharges,
        serviceFee,
        rate: freightCharge + codCharges + serviceFee,
        rating: typeof c.rating === "number" ? c.rating : null,
        recommended: index === 0,
        etd: c.etd ?? null,
        estimatedDays: courierDays(c),
      };
    });
  options.sort((a, b) => a.rate - b.rate);
  return options;
}

// Courier days for a route as the delivery estimate uses them: Shiprocket's
// recommended courier, falling back to the fastest one that gave a figure.
export function routeTransitDays(couriers: CourierOption[]): number | null {
  const recommended = couriers.find((c) => c.recommended && c.estimatedDays != null);
  if (recommended) return recommended.estimatedDays;
  const known = couriers.map((c) => c.estimatedDays).filter((d): d is number => d != null);
  return known.length ? Math.min(...known) : null;
}

// The fare of the courier actually booked, for the shipment's cost record.
// Best-effort: a failed lookup never blocks a booking.
export async function bookedCourierCost(
  supabase: SupabaseClient,
  params: { pickupPincode: string; deliveryPincode: string; cod: boolean; weightKg: number; courierId: number | null },
): Promise<number | null> {
  if (!params.courierId || !params.pickupPincode || !params.deliveryPincode) return null;
  try {
    const couriers = await checkCourierServiceability(supabase, params);
    return couriers.find((c) => c.courierId === params.courierId)?.rate ?? null;
  } catch (e) {
    console.error("bookedCourierCost: rate lookup failed", errorMessage(e));
    return null;
  }
}

export interface Consignee {
  name: string;
  email: string;
  phone: string;
  address: VendorAddress;
}

export interface ForwardBookingItem {
  name: string;
  sku: string;
  units: number;
  selling_price: number;
}

export interface ForwardBookingResult {
  orderId: number | null;
  shipmentId: number | null;
  awbCode: string | null;
  courierId: number | null;
  courierName: string | null;
  labelUrl: string | null;
  manifestUrl: string | null;
}

// One parcel from a registered pickup location to any address, booked with
// courier + pickup in one call (Shiprocket's Forward wrapper). Used by every
// outbound leg: boutique -> warehouse, warehouse -> customer, warehouse ->
// boutique, and the original boutique -> customer.
export async function bookForwardShipment(
  supabase: SupabaseClient,
  params: {
    channelOrderId: string;
    orderDate: string;
    pickupLocationName: string;
    consignee: Consignee;
    items: ForwardBookingItem[];
    cod: boolean;
    subTotal: number;
    shippingCharges: number;
    totalDiscount: number;
    weightKg: number;
    lengthCm: number;
    breadthCm: number;
    heightCm: number;
    courierId?: number | null;
  },
): Promise<ForwardBookingResult> {
  const a = params.consignee.address;
  const result = await shiprocketRequest(supabase, "/shipments/create/forward-shipment", {
    method: "POST",
    body: {
      mode: "Surface",
      request_pickup: true,
      print_label: true,
      generate_manifest: true,
      order_id: params.channelOrderId,
      order_date: params.orderDate.slice(0, 19).replace("T", " "),
      pickup_location: params.pickupLocationName,
      billing_customer_name: params.consignee.name,
      billing_last_name: "",
      billing_address: a.address_line1,
      billing_address_2: a.address_line2 || "",
      billing_city: a.city,
      billing_state: a.state,
      billing_country: a.country || "India",
      billing_pincode: a.pincode,
      billing_email: params.consignee.email,
      billing_phone: params.consignee.phone,
      shipping_is_billing: "1",
      order_items: params.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        units: i.units,
        hsn: "",
        selling_price: i.selling_price,
        discount: "0",
        tax: "0",
      })),
      payment_method: params.cod ? "COD" : "PREPAID",
      shipping_charges: params.shippingCharges,
      total_discount: String(params.totalDiscount),
      sub_total: params.subTotal,
      weight: params.weightKg,
      length: params.lengthCm,
      breadth: params.breadthCm,
      height: params.heightCm,
      ...(params.courierId ? { courier_id: params.courierId } : {}),
    },
  });

  // HTTP 200 even for a logical failure - status:1 is the real success signal.
  if (result.status !== 1) {
    throw new Error(result.payload?.error_message || "Shiprocket rejected the shipment request");
  }
  const p = result.payload;
  return {
    orderId: toIntOrNull(p.order_id),
    shipmentId: toIntOrNull(p.shipment_id),
    awbCode: p.awb_code || null,
    courierId: toIntOrNull(p.courier_company_id),
    courierName: p.courier_name ?? null,
    labelUrl: p.label_url ?? null,
    manifestUrl: p.manifest_url ?? null,
  };
}

// A Shiprocket order exists but we failed to record it - cancel it back out
// so a retry doesn't leave a duplicate live booking.
export async function cancelOrphanedShiprocketOrder(supabase: SupabaseClient, shiprocketOrderId: number | null) {
  if (!shiprocketOrderId) return;
  try {
    await shiprocketRequest(supabase, "/orders/cancel", { method: "POST", body: { ids: [shiprocketOrderId] } });
  } catch (e) {
    console.error("cancelOrphanedShiprocketOrder failed", errorMessage(e));
  }
}

// Cancels any not-yet-picked-up booking (by shipments row) - deletes the row
// so the leg can be booked again. Returns false if the courier already has it.
export async function cancelBookingRow(
  supabase: SupabaseClient,
  shipment: { id: string; awb_code: string | null; shiprocket_order_id: number | null; status: string },
): Promise<boolean> {
  if (shipment.status !== "cancelled" && !NOT_YET_PICKED_UP_STATUSES.includes(shipment.status)) return false;
  if (shipment.shiprocket_order_id) {
    try {
      await shiprocketRequest(supabase, "/orders/cancel", { method: "POST", body: { ids: [shipment.shiprocket_order_id] } });
    } catch (e) {
      // Already cancelled on Shiprocket's side is fine; anything else is real.
      if (shipment.status !== "cancelled") throw e;
    }
  }
  await supabase.from("shipments").delete().eq("id", shipment.id);
  return true;
}

// Shiprocket's own responses sometimes carry "" (empty string) instead of
// null/omitted for a numeric field that didn't get populated (e.g. AWB
// assignment inside the Forward wrapper partially failing while order
// creation itself succeeded). `?? null` does NOT catch "" - only
// null/undefined - so it was passed straight through into an
// integer/bigint column, which Postgres rejects with
// 'invalid input syntax for type integer: ""'. Confirmed as a real,
// reproducible bug from a live "Confirm & Ship" attempt, not a guess.
export function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const NOT_YET_PICKED_UP_STATUSES = ["pending", "awb_assigned", "pickup_scheduled"];

export interface ShiprocketCancelResult {
  attempted: boolean; // was there actually a shipment to try cancelling?
  alreadyPickedUp: boolean; // shipment existed but is past the point Shiprocket allows a clean cancel
  shipmentCancelled: boolean; // did we actually cancel/remove the shipments row
}

export interface CancelShiprocketShipmentOptions {
  // Change Courier (shiprocket-cancel-shipment's admin/vendor "redo the
  // booking" path) deletes the row so a fresh Ship Now finds nothing and
  // books genuinely new - there's no order-level cancellation to keep a
  // record of, the booking was simply a mistake to correct. A real
  // cancellation (the default - customer self-service, or admin's own
  // "Cancel Order") keeps the row marked cancelled instead, preserving the
  // audit trail of what was booked before the order was actually cancelled.
  deleteOnCancel?: boolean;
}

// Cancels a vendor_order's forward shipment on Shiprocket's side, if one
// exists and hasn't been picked up yet. Deliberately does NOT touch
// vendor_orders.status itself - callers own that, since they differ on
// what "already picked up" should mean: shiprocket-cancel-shipment (admin/
// vendor path) refuses outright, cancel-order-items (customer path)
// proceeds anyway as a best-effort cancel - the courier booking can't be
// undone, but the customer's cancellation/refund still goes through.
export async function cancelShiprocketShipment(
  supabase: SupabaseClient,
  vendorOrderId: string,
  options: CancelShiprocketShipmentOptions = {},
): Promise<ShiprocketCancelResult> {
  // The boutique's own outbound parcel: straight to the customer, or to the
  // warehouse on the warehouse route (not an exchange replacement).
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, awb_code, shiprocket_order_id, status")
    .eq("vendor_order_id", vendorOrderId)
    .in("shipment_type", ["forward", "to_warehouse"])
    .is("return_request_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!shipment) {
    return { attempted: false, alreadyPickedUp: false, shipmentCancelled: false };
  }

  const realCancellation = !options.deleteOnCancel;

  // Booking already dead (courier auto-cancelled it) - Shiprocket leaves
  // that order sitting open as NEW, so a real cancellation closes it too.
  if (shipment.status === "cancelled") {
    if (realCancellation && shipment.shiprocket_order_id) {
      await shiprocketRequest(supabase, "/orders/cancel", {
        method: "POST",
        body: { ids: [shipment.shiprocket_order_id] },
      });
    } else if (options.deleteOnCancel) {
      await supabase.from("shipments").delete().eq("id", shipment.id);
    }
    return { attempted: true, alreadyPickedUp: false, shipmentCancelled: true };
  }

  if (!NOT_YET_PICKED_UP_STATUSES.includes(shipment.status)) {
    return { attempted: true, alreadyPickedUp: true, shipmentCancelled: false };
  }

  // A real cancellation cancels the whole Shiprocket order (which also
  // cancels its AWB and refunds the freight to the wallet). Cancelling only
  // the AWB is for re-booking: it leaves the order open as NEW in the
  // Shiprocket panel - and was refused outright for a "pickup exception"
  // shipment, which is how a customer-cancelled order stayed live.
  if (realCancellation && shipment.shiprocket_order_id) {
    await shiprocketRequest(supabase, "/orders/cancel", {
      method: "POST",
      body: { ids: [shipment.shiprocket_order_id] },
    });
  } else if (shipment.awb_code) {
    await shiprocketRequest(supabase, "/orders/cancel/shipment/awbs", {
      method: "POST",
      body: { awbs: [shipment.awb_code] },
    });
  } else if (shipment.shiprocket_order_id) {
    await shiprocketRequest(supabase, "/orders/cancel", {
      method: "POST",
      body: { ids: [shipment.shiprocket_order_id] },
    });
  }

  if (options.deleteOnCancel) {
    // shipment_events has ON DELETE CASCADE on shipment_id - no orphans.
    await supabase.from("shipments").delete().eq("id", shipment.id);
  } else {
    await supabase.from("shipments").update({ status: "cancelled" }).eq("id", shipment.id);
  }
  return { attempted: true, alreadyPickedUp: false, shipmentCancelled: true };
}

// Who may book the reverse pickup for a return/exchange: admins always; the
// owning boutique's members once the request is approved (they decide
// requests first under the boutique-first return workflow).
export async function canBookReturnPickup(
  supabase: SupabaseClient,
  userId: string,
  returnRequestId: string,
): Promise<boolean> {
  if (await isAdmin(supabase, userId)) return true;
  const { data: rr } = await supabase
    .from("return_requests")
    .select("status")
    .eq("id", returnRequestId)
    .maybeSingle();
  if (rr?.status !== "approved") return false;
  const { data: vendorId } = await supabase.rpc("return_request_sole_vendor", { _request_id: returnRequestId });
  return !!vendorId && (await isVendorMember(supabase, userId, vendorId as string));
}
