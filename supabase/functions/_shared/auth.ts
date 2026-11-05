import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Generic gateway-call error - carries the real HTTP status/body so
// errorMessage() below can unwrap the actual reason instead of a generic
// wrapper string. Shared by every outbound integration (Shiprocket,
// Razorpay, ...) rather than each defining its own near-identical class.
export class AppError extends Error {
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
// `e instanceof Error` is false for it. Every catch block was falling
// through to a literal "Unknown error" for any real DB failure, hiding the
// actual cause from both the user and the logs. Confirmed as the real bug
// behind a live "unknown error" report on Ship Now, not a hypothetical.
export function errorMessage(e: unknown): string {
  // AppError's own .message is a generic "<Service> <path> failed" wrapper -
  // the actually useful detail lives in the response body the gateway sent
  // back. Covers both Shiprocket's shape ({message}/{payload:{error_message}}/
  // {errors}) and Razorpay's ({error:{description}}) since both integrations
  // throw this same class.
  if (e instanceof AppError) {
    const body = e.body as any;
    const detail = body?.message || body?.payload?.error_message || body?.errors || body?.error?.description;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      try {
        return Object.values(detail).flat().join("; ") || e.message;
      } catch {
        return e.message;
      }
    }
    return e.message;
  }
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
