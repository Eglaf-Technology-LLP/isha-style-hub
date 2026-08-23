import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BASE_URL = "https://apiv2.shiprocket.in/v1/external";

export class ShiprocketError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Supabase's own PostgrestError (from `if (error) throw error` on any
// `.select()`/`.insert()`/etc.) is a plain object, NOT an Error instance -
// `e instanceof Error` is false for it. Every catch block in these
// functions was falling through to a literal "Unknown error" for any real
// DB failure, hiding the actual cause from both the user and the logs.
// Confirmed as the real bug behind a live "unknown error" report on
// Ship Now, not a hypothetical.
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as any).message === "string") {
    return (e as any).message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

// Identifies the calling user from their own Authorization header (the
// platform's verify_jwt=true gate already confirmed it's a valid JWT
// before this code runs - this resolves it to an actual user id so
// callers can check admin/vendor-membership before a privileged write).
export async function getCallerUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}

export async function isVendorMember(
  supabase: SupabaseClient,
  userId: string,
  vendorId: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("is_vendor_member", { _user_id: userId, _vendor_id: vendorId });
  return data === true;
}

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

  const pickupLocationName = vendor.slug;
  let pickupId: number | null = null;

  const existing = await shiprocketRequest(supabase, "/settings/company/pickup");
  const alreadyThere = (existing?.data?.shipping_address ?? []).find(
    (p: any) => p.pickup_location === pickupLocationName,
  );

  if (alreadyThere) {
    pickupId = alreadyThere.id ?? null;
  } else {
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
    pickupId = created?.pickup_id ?? created?.address?.id ?? null;
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

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
