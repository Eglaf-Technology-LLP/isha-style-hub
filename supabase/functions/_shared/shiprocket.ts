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
  "CANCELED": { shipmentStatus: "cancelled", vendorOrderStatus: "cancelled" },
  "CANCELLED": { shipmentStatus: "cancelled", vendorOrderStatus: "cancelled" },
  "RETURN PENDING": { shipmentStatus: "pending", vendorOrderStatus: null },
  "LOST": { shipmentStatus: "lost", vendorOrderStatus: null },
};

const DEFAULT_STATUS: CoarseStatus = { shipmentStatus: "in_transit", vendorOrderStatus: null };

export function mapShiprocketStatus(rawStatus: string): CoarseStatus {
  const normalized = (rawStatus || "").trim().toUpperCase();
  if (STATUS_MAP[normalized]) return STATUS_MAP[normalized];
  if (normalized.includes("RTO")) return { shipmentStatus: "rto", vendorOrderStatus: "returned" };
  if (normalized.includes("NDR")) return { shipmentStatus: "ndr", vendorOrderStatus: "ndr" };
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
  if (vendor.shiprocket_pickup_location) {
    return { name: vendor.shiprocket_pickup_location, id: vendor.shiprocket_pickup_id ?? null };
  }

  const address = vendor.address ?? {};
  const missing = ["address_line1", "city", "state", "pincode"].filter(
    (f) => !(address as Record<string, string>)[f]?.trim(),
  );
  if (missing.length > 0 || !vendor.contact_phone?.trim()) {
    throw new Error(
      `Vendor address is incomplete - missing: ${[...missing, ...(!vendor.contact_phone?.trim() ? ["contact_phone"] : [])].join(", ")}`,
    );
  }

  const existing = await shiprocketRequest(supabase, "/settings/company/pickup");
  const existingLocations: any[] = existing?.data?.shipping_address ?? [];
  const baseName = vendor.slug;
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
        name: vendor.name,
        email: vendor.contact_email || "orders@ishafashionhub.com",
        phone: vendor.contact_phone,
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
    .from("vendors")
    .update({
      shiprocket_pickup_location: pickupLocationName,
      shiprocket_pickup_id: pickupId,
      shiprocket_pickup_registered_at: new Date().toISOString(),
    })
    .eq("id", vendor.id);
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
  rate: number;
  etd: string | null;
  codAvailable: boolean;
}

// Real courier names/rates/ETDs for this pickup->delivery route, straight
// from Shiprocket's own serviceability check - lets the vendor actually
// pick a courier and see the fare instead of Shiprocket auto-assigning
// one silently. Sorted cheapest first.
export async function checkCourierServiceability(
  supabase: SupabaseClient,
  params: { pickupPincode: string; deliveryPincode: string; cod: boolean; weightKg: number },
): Promise<CourierOption[]> {
  const result = await shiprocketRequest(
    supabase,
    `/courier/serviceability/?pickup_postcode=${encodeURIComponent(params.pickupPincode)}` +
      `&delivery_postcode=${encodeURIComponent(params.deliveryPincode)}` +
      `&cod=${params.cod ? 1 : 0}&weight=${params.weightKg}`,
  );

  const companies = result?.data?.available_courier_companies ?? [];
  const options: CourierOption[] = companies
    .filter((c: any) => !c.blocked)
    .map((c: any) => ({
      courierId: c.courier_company_id,
      courierName: c.courier_name,
      rate: Number(c.rate ?? c.freight_charge ?? 0),
      etd: c.etd ?? null,
      codAvailable: c.cod === 1,
    }));
  options.sort((a, b) => a.rate - b.rate);
  return options;
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
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, awb_code, shiprocket_order_id, status")
    .eq("vendor_order_id", vendorOrderId)
    .eq("shipment_type", "forward")
    .maybeSingle();

  if (!shipment) {
    return { attempted: false, alreadyPickedUp: false, shipmentCancelled: false };
  }

  if (!NOT_YET_PICKED_UP_STATUSES.includes(shipment.status)) {
    return { attempted: true, alreadyPickedUp: true, shipmentCancelled: false };
  }

  if (shipment.awb_code) {
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
