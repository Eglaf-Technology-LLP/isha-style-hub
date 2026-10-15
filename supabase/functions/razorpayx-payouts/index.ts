import { corsHeaders, errorMessage, getCallerUserId, isAdmin, isVendorMember, jsonResponse, serviceClient } from "../_shared/auth.ts";
import {
  friendlyXError,
  payoutRail,
  refreshValidations,
  registerVendorAccount,
  sendPayouts,
  syncProcessingPayouts,
  xAccountNumber,
  xBalance,
} from "../_shared/razorpayx.ts";

// Boutique payouts through RazorpayX.
//   register        boutique (or admin): put its bank account into RazorpayX
//                   and start the ₹1 check
//   check_accounts  admin: refresh ₹1 checks in progress
//   approve_name    admin: accept a bank name that differs from the one given
//   prepare         admin: batch every ready boutique order (window closed,
//                   nothing open) into one pending payout per boutique
//   send            admin: send pending payouts (each order re-checked first)
//   sync            admin: refresh payouts on their way
//   status          admin: rail, RazorpayX activation, balance, counts
//   settings        admin: switch automatic sending on/off
//   payout_day      cron (daily 09:30 IST): on the payout weekday, prepare
//                   and - if automatic sending is on - send; every day,
//                   refresh checks and statuses.

function isServiceRoleCall(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    return JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

const todayIst = () => new Date(Date.now() + 5.5 * 3600_000);

// Bank accounts not yet in RazorpayX (or whose check couldn't start) - also
// picked up daily, so they're checked as soon as RazorpayX is active.
async function registerWaitingAccounts(supabase: ReturnType<typeof serviceClient>) {
  const { data: waiting } = await supabase
    .from("vendor_payout_accounts")
    .select("vendor_id, rzpx_status")
    .in("rzpx_status", ["not_started", "registered", "failed"]);
  const out = [];
  for (const a of waiting ?? []) {
    // "registered" only needs another go once the ₹1 check can run.
    if (a.rzpx_status === "registered" && !xAccountNumber()) continue;
    out.push({ vendor_id: a.vendor_id, ...(await registerVendorAccount(supabase, a.vendor_id)) });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = serviceClient();
    const body = await req.json().catch(() => ({}));
    const action: string = body?.action ?? "";
    const service = isServiceRoleCall(req);
    const userId = service ? null : await getCallerUserId(req);
    if (!service && !userId) return jsonResponse({ error: "Sign in first" }, 401);
    const admin = service || (userId ? await isAdmin(supabase, userId) : false);

    if (action === "register") {
      const vendorId = String(body.vendor_id ?? "");
      if (!vendorId) return jsonResponse({ error: "vendor_id is required" }, 400);
      if (!admin && !(await isVendorMember(supabase, userId!, vendorId))) return jsonResponse({ error: "Forbidden" }, 403);
      return jsonResponse(await registerVendorAccount(supabase, vendorId));
    }

    if (!admin) return jsonResponse({ error: "Forbidden" }, 403);

    switch (action) {
      case "check_accounts":
        return jsonResponse({ registered: await registerWaitingAccounts(supabase), refreshed: await refreshValidations(supabase) });

      case "approve_name": {
        const vendorId = String(body.vendor_id ?? "");
        const { data, error } = await supabase
          .from("vendor_payout_accounts")
          .update({ rzpx_status: "verified", rzpx_verified_at: new Date().toISOString(), rzpx_name_approved_by: userId })
          .eq("vendor_id", vendorId)
          .eq("rzpx_status", "name_mismatch")
          .select("vendor_id")
          .maybeSingle();
        if (error) throw error;
        if (!data) return jsonResponse({ error: "This bank account isn't waiting for a name approval" }, 400);
        await supabase.from("vendors").update({ payout_account_status: "active" }).eq("id", vendorId).neq("payout_account_status", "disabled");
        return jsonResponse({ ok: true });
      }

      case "prepare": {
        const { data, error } = await supabase.rpc("prepare_vendor_payouts", {});
        if (error) throw error;
        return jsonResponse({ results: data ?? [] });
      }

      case "send": {
        let ids: string[] = Array.isArray(body.payout_ids) ? body.payout_ids.map(String) : [];
        if (body.all) {
          const { data } = await supabase.from("vendor_payouts").select("id").eq("status", "pending");
          ids = (data ?? []).map((p) => p.id);
        }
        return jsonResponse({ results: await sendPayouts(supabase, ids, userId) });
      }

      case "sync":
        return jsonResponse({ payouts: await syncProcessingPayouts(supabase), accounts: await refreshValidations(supabase) });

      case "settings": {
        const { error } = await supabase
          .from("platform_settings")
          .update({ payout_auto_send: Boolean(body.auto_send), updated_by: userId })
          .eq("id", true);
        if (error) throw error;
        return jsonResponse({ ok: true });
      }

      case "status": {
        const [{ data: settings }, { data: accounts }, { data: payouts }] = await Promise.all([
          supabase.from("platform_settings").select("payout_rail, payout_auto_send").eq("id", true).maybeSingle(),
          supabase.from("vendor_payout_accounts").select("rzpx_status"),
          supabase.from("vendor_payouts").select("status, net_payable").in("status", ["pending", "processing"]),
        ]);
        let balance: number | null = null;
        let balanceError: string | null = null;
        try {
          balance = await xBalance();
        } catch (e) {
          balanceError = friendlyXError(e);
        }
        const count = (s: string) => (accounts ?? []).filter((a) => a.rzpx_status === s).length;
        const sum = (s: string) => (payouts ?? []).filter((p) => p.status === s).reduce((t, p) => t + Number(p.net_payable), 0);
        return jsonResponse({
          rail: settings?.payout_rail ?? "razorpayx",
          auto_send: settings?.payout_auto_send ?? false,
          x_activated: Boolean(xAccountNumber()),
          balance,
          balance_error: balanceError,
          accounts: {
            verified: count("verified"),
            name_mismatch: count("name_mismatch"),
            invalid: count("invalid"),
            waiting: count("not_started") + count("registered") + count("verifying") + count("failed"),
          },
          pending: { count: (payouts ?? []).filter((p) => p.status === "pending").length, amount: sum("pending") },
          processing: { count: (payouts ?? []).filter((p) => p.status === "processing").length, amount: sum("processing") },
        });
      }

      case "payout_day": {
        const rail = await payoutRail(supabase);
        if (rail !== "razorpayx") return jsonResponse({ skipped: `payout rail is ${rail}` });
        const summary: Record<string, unknown> = {
          registered: (await registerWaitingAccounts(supabase)).length,
          accounts: await refreshValidations(supabase),
          synced: await syncProcessingPayouts(supabase),
        };
        // Only on the payout weekday (admins' rates; Wednesday by default).
        const { data: rates } = await supabase.rpc("rates_on", { _at: new Date().toISOString() });
        const weekday = ((todayIst().getUTCDay() + 6) % 7) + 1; // ISO 1=Mon..7=Sun
        if (Number((rates as any)?.payout_weekday ?? 3) !== weekday) return jsonResponse({ ...summary, payout_day: false });
        const { data: prepared, error } = await supabase.rpc("prepare_vendor_payouts", {});
        if (error) throw error;
        summary.prepared = prepared ?? [];
        const { data: settings } = await supabase.from("platform_settings").select("payout_auto_send").eq("id", true).maybeSingle();
        if (settings?.payout_auto_send) {
          const { data: pending } = await supabase.from("vendor_payouts").select("id").eq("status", "pending");
          summary.sent = await sendPayouts(supabase, (pending ?? []).map((p) => p.id), null);
        }
        return jsonResponse({ ...summary, payout_day: true });
      }

      default:
        return jsonResponse({ error: `Unknown action "${action}"` }, 400);
    }
  } catch (e) {
    console.error("razorpayx-payouts error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
