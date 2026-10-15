import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { AppError, errorMessage } from "./auth.ts";
import { notifyAdmins, notifyVendor, onboardVendor } from "./razorpayRoute.ts";

// Boutique payouts through RazorpayX - see migration
// 20261016110000_razorpayx_payouts.sql for the flow. Payments settle to
// AllBoutiqs' RazorpayX current account; each boutique is a RazorpayX contact
// with a fund account (its bank account), checked with a ₹1 deposit, and is
// paid by a payout (bank transfer) on payout day.

const RZP = "https://api.razorpay.com";

// AllBoutiqs' RazorpayX account number - set once RazorpayX is activated.
export const xAccountNumber = () => Deno.env.get("RAZORPAYX_ACCOUNT_NUMBER") ?? "";

async function rzpx(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<any> {
  const id = Deno.env.get("RAZORPAY_KEY_ID");
  const secret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!id || !secret) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
  const res = await fetch(`${RZP}${path}`, {
    method,
    headers: {
      Authorization: "Basic " + btoa(`${id}:${secret}`),
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Payout-Idempotency": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError(res.status, data?.error?.description ?? `RazorpayX ${path} failed`, data);
  return data;
}

// "Access to requested resource not available" = RazorpayX isn't activated
// on the account yet.
export function friendlyXError(e: unknown): string {
  const msg = errorMessage(e);
  if (/not available|not activated|account_number/i.test(msg)) {
    return "RazorpayX isn't activated on the AllBoutiqs Razorpay account yet";
  }
  return msg;
}

export async function payoutRail(supabase: SupabaseClient): Promise<"razorpayx" | "razorpay_route" | "manual"> {
  const { data } = await supabase.from("platform_settings").select("payout_rail").eq("id", true).maybeSingle();
  return (data?.payout_rail as any) ?? "razorpayx";
}

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const paise = (rupees: number) => Math.round(Number(rupees) * 100);
const clip = (s: string, n: number) => s.trim().slice(0, n);

// Bank-held name vs the name given: same person/business if at least half
// the words of the shorter one appear in the other (ignoring titles/suffixes).
export function namesMatch(bankName: string | null | undefined, ...given: (string | null | undefined)[]): boolean {
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(m\/s|ms|mr|mrs|miss|shri|smt|dr|pvt|private|ltd|limited|llp|the|and|co)\b/g, " ")
      .replace(/[^a-z ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
  const bank = words(bankName ?? "");
  if (!bank.length) return false;
  return given.some((g) => {
    const w = words(g ?? "");
    if (!w.length) return false;
    const set = new Set(bank);
    const common = w.filter((x) => set.has(x)).length;
    return common / Math.min(w.length, bank.length) >= 0.5;
  });
}

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------

export interface AccountState {
  rail: string;
  status: string;
  error: string | null;
  registered_name?: string | null;
}

// Puts the boutique's bank account into RazorpayX (contact + fund account)
// and starts the ₹1 check. On the Route rail it does Route's onboarding.
export async function registerVendorAccount(supabase: SupabaseClient, vendorId: string): Promise<AccountState> {
  const rail = await payoutRail(supabase);
  if (rail === "razorpay_route") {
    const r = await onboardVendor(supabase, vendorId);
    return { rail, status: r.razorpay_status, error: r.razorpay_error };
  }
  // Paused (manual payouts): nothing is sent to RazorpayX.
  if (rail === "manual") {
    const { data: a } = await supabase.from("vendor_payout_accounts").select("rzpx_status, rzpx_error").eq("vendor_id", vendorId).maybeSingle();
    return { rail, status: a?.rzpx_status ?? "not_started", error: a?.rzpx_error ?? null };
  }

  const [{ data: acct }, { data: vendor }] = await Promise.all([
    supabase.from("vendor_payout_accounts").select("*").eq("vendor_id", vendorId).maybeSingle(),
    supabase.from("vendors").select("id, name, boutique_code, contact_email, contact_phone, payout_account_status").eq("id", vendorId).maybeSingle(),
  ]);
  if (!acct || !vendor) throw new AppError(400, "Add the bank details first", null);

  const save = (patch: Record<string, unknown>) =>
    supabase.from("vendor_payout_accounts").update(patch).eq("vendor_id", vendorId);

  try {
    let contactId = acct.rzpx_contact_id as string | null;
    if (!contactId) {
      const phone = String(vendor.contact_phone ?? "").replace(/\D/g, "").slice(-10);
      const contact = await rzpx("POST", "/v1/contacts", {
        name: clip(acct.legal_business_name || vendor.name, 50),
        ...(vendor.contact_email ? { email: vendor.contact_email } : {}),
        ...(phone.length === 10 ? { contact: phone } : {}),
        type: "vendor",
        reference_id: clip(vendor.boutique_code ?? vendor.id, 40),
        notes: { vendor_id: vendor.id },
      });
      contactId = contact.id;
    }
    let fundAccountId = acct.rzpx_fund_account_id as string | null;
    if (!fundAccountId) {
      const fa = await rzpx("POST", "/v1/fund_accounts", {
        contact_id: contactId,
        account_type: "bank_account",
        bank_account: { name: clip(acct.account_holder_name, 120), ifsc: acct.bank_ifsc, account_number: acct.bank_account_number },
      });
      fundAccountId = fa.id;
    }
    await save({ rzpx_contact_id: contactId, rzpx_fund_account_id: fundAccountId, rzpx_status: "registered", rzpx_error: null });
    if (["not_setup", "needs_update"].includes(vendor.payout_account_status)) {
      await supabase.from("vendors").update({ payout_account_status: "pending" }).eq("id", vendorId);
    }

    // The ₹1 check needs the RazorpayX account; until it's activated the
    // account waits as "registered".
    if (!xAccountNumber()) return { rail, status: "registered", error: null };
    const validation = await rzpx("POST", "/v1/fund_accounts/validations", {
      account_number: xAccountNumber(),
      fund_account: { id: fundAccountId },
      amount: 100,
      currency: "INR",
      notes: { vendor_id: vendorId },
    });
    await save({ rzpx_validation_id: validation.id, rzpx_status: "verifying" });
    return await applyValidation(supabase, validation);
  } catch (e) {
    const message = friendlyXError(e);
    await save({ rzpx_status: acct.rzpx_fund_account_id ? acct.rzpx_status : "failed", rzpx_error: message });
    return { rail, status: "failed", error: message };
  }
}

// Result of a ₹1 check (from the API or a fund_account.validation.* webhook).
export async function applyValidation(supabase: SupabaseClient, v: any): Promise<AccountState> {
  const { data: acct } = await supabase
    .from("vendor_payout_accounts")
    .select("vendor_id, account_holder_name, legal_business_name, rzpx_status")
    .eq("rzpx_validation_id", v?.id ?? "")
    .maybeSingle();
  if (!acct) return { rail: "razorpayx", status: "unknown", error: "validation not found" };
  const save = (patch: Record<string, unknown>) =>
    supabase.from("vendor_payout_accounts").update(patch).eq("vendor_id", acct.vendor_id);

  if (v.status === "completed") {
    const name = v.results?.registered_name ?? null;
    if (v.results?.account_status !== "active") {
      await save({ rzpx_status: "invalid", rzpx_registered_name: name, rzpx_error: "The bank couldn't confirm this account" });
      await supabase.from("vendors").update({ payout_account_status: "needs_update" }).eq("id", acct.vendor_id);
      await notifyVendor(
        supabase,
        acct.vendor_id,
        "payout_account_invalid",
        "Bank account couldn't be verified",
        "Your bank couldn't confirm the payout account you added. Please check the account number and IFSC and save them again.",
      );
      return { rail: "razorpayx", status: "invalid", error: "The bank couldn't confirm this account", registered_name: name };
    }
    if (namesMatch(name, acct.account_holder_name, acct.legal_business_name)) {
      await save({ rzpx_status: "verified", rzpx_registered_name: name, rzpx_error: null, rzpx_verified_at: new Date().toISOString() });
      await supabase.from("vendors").update({ payout_account_status: "active" }).eq("id", acct.vendor_id).neq("payout_account_status", "disabled");
      return { rail: "razorpayx", status: "verified", error: null, registered_name: name };
    }
    await save({ rzpx_status: "name_mismatch", rzpx_registered_name: name, rzpx_error: null });
    await notifyAdmins(
      supabase,
      "payout_account_name_mismatch",
      "Bank name doesn't match a boutique",
      `The bank says this boutique's account belongs to "${name}", not "${acct.account_holder_name}". Check and approve it in Vendor payouts.`,
    );
    return { rail: "razorpayx", status: "name_mismatch", error: null, registered_name: name };
  }
  if (v.status === "failed") {
    const reason = v.status_details?.description ?? "The bank account check failed";
    await save({ rzpx_status: "failed", rzpx_error: reason });
    return { rail: "razorpayx", status: "failed", error: reason };
  }
  return { rail: "razorpayx", status: acct.rzpx_status, error: null };
}

// Looks up ₹1 checks still in progress.
export async function refreshValidations(supabase: SupabaseClient): Promise<number> {
  const { data: pending } = await supabase.from("vendor_payout_accounts").select("rzpx_validation_id").eq("rzpx_status", "verifying");
  let n = 0;
  for (const a of pending ?? []) {
    try {
      const v = await rzpx("GET", `/v1/fund_accounts/validations/${a.rzpx_validation_id}`);
      await applyValidation(supabase, v);
      n++;
    } catch (e) {
      console.error("refreshValidations", a.rzpx_validation_id, errorMessage(e));
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export interface SendResult {
  payout_id: string;
  ok: boolean;
  amount?: number;
  status?: string;
  error?: string;
}

// Sends pending payouts: each order is re-checked first (window closed,
// nothing open), then one RazorpayX payout per boutique. Idempotent per
// payout id, so a retry never pays twice.
export async function sendPayouts(supabase: SupabaseClient, payoutIds: string[], sentBy: string | null): Promise<SendResult[]> {
  const results: SendResult[] = [];
  for (const id of payoutIds) {
    const { data: p } = await supabase.from("vendor_payouts").select("id, vendor_id, status").eq("id", id).maybeSingle();
    if (!p || p.status !== "pending") {
      results.push({ payout_id: id, ok: false, error: "not waiting to be sent" });
      continue;
    }
    const { data: acct } = await supabase
      .from("vendor_payout_accounts")
      .select("rzpx_status, rzpx_fund_account_id")
      .eq("vendor_id", p.vendor_id)
      .maybeSingle();
    if (acct?.rzpx_status !== "verified" || !acct.rzpx_fund_account_id) {
      results.push({ payout_id: id, ok: false, error: "the boutique's bank account isn't verified yet" });
      continue;
    }
    const { data: amount, error: recheckErr } = await supabase.rpc("recheck_vendor_payout", { _payout_id: id });
    if (recheckErr) {
      results.push({ payout_id: id, ok: false, error: recheckErr.message });
      continue;
    }
    if (!amount || Number(amount) <= 0) {
      results.push({ payout_id: id, ok: true, amount: 0, status: "removed - nothing payable any more" });
      continue;
    }
    if (!xAccountNumber()) {
      const error = "RazorpayX isn't activated on the AllBoutiqs Razorpay account yet";
      await supabase.from("vendor_payouts").update({ rzpx_error: error }).eq("id", id);
      results.push({ payout_id: id, ok: false, error });
      continue;
    }
    try {
      const mode = Number(amount) < 1000 ? "IMPS" : "NEFT";
      const res = await rzpx(
        "POST",
        "/v1/payouts",
        {
          account_number: xAccountNumber(),
          fund_account_id: acct.rzpx_fund_account_id,
          amount: paise(Number(amount)),
          currency: "INR",
          mode,
          purpose: "payout",
          queue_if_low_balance: true,
          reference_id: id,
          narration: "AllBoutiqs payout",
          notes: { vendor_id: p.vendor_id, payout_id: id },
        },
        id,
      );
      await supabase
        .from("vendor_payouts")
        .update({
          status: "processing",
          method: "razorpayx",
          rzpx_payout_id: res.id,
          rzpx_status: res.status,
          rzpx_mode: res.mode ?? mode,
          rzpx_fees: typeof res.fees === "number" ? res.fees / 100 : null,
          rzpx_tax: typeof res.tax === "number" ? res.tax / 100 : null,
          rzpx_error: null,
          sent_by: sentBy,
          sent_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending");
      await applyPayoutEntity(supabase, res);
      results.push({ payout_id: id, ok: true, amount: Number(amount), status: res.status });
    } catch (e) {
      const error = friendlyXError(e);
      await supabase.from("vendor_payouts").update({ rzpx_error: error }).eq("id", id);
      results.push({ payout_id: id, ok: false, error });
    }
  }
  return results;
}

const FAILED = ["reversed", "failed", "rejected", "cancelled"];

// A payout's state from RazorpayX (API response or payout.* webhook).
export async function applyPayoutEntity(supabase: SupabaseClient, e: any): Promise<string | null> {
  if (!e?.id) return null;
  const { data: p } = await supabase
    .from("vendor_payouts")
    .select("id, vendor_id, status, net_payable")
    .or(`rzpx_payout_id.eq.${e.id}${e.reference_id ? `,id.eq.${e.reference_id}` : ""}`)
    .maybeSingle();
  if (!p) return null;
  const base = {
    rzpx_payout_id: e.id,
    rzpx_status: e.status,
    ...(typeof e.fees === "number" ? { rzpx_fees: e.fees / 100 } : {}),
    ...(typeof e.tax === "number" ? { rzpx_tax: e.tax / 100 } : {}),
    ...(e.mode ? { rzpx_mode: e.mode } : {}),
  };

  if (e.status === "processed") {
    if (p.status === "processing") {
      await supabase
        .from("vendor_payouts")
        .update({ ...base, status: "paid", payment_reference: e.utr || e.id, paid_at: new Date().toISOString() })
        .eq("id", p.id);
    } else {
      await supabase.from("vendor_payouts").update(base).eq("id", p.id);
    }
    return "paid";
  }
  if (FAILED.includes(e.status)) {
    const reason = e.status_details?.description ?? e.failure_reason ?? `RazorpayX payout ${e.status}`;
    if (p.status === "processing") {
      await supabase.from("vendor_payouts").update({ ...base, status: "failed", failure_reason: reason }).eq("id", p.id);
    } else if (p.status === "paid") {
      // Credited, then returned by the bank - money is back in our account.
      await supabase.from("vendor_payouts").update(base).eq("id", p.id);
      await notifyAdmins(
        supabase,
        "payout_reversed",
        "A credited payout came back",
        `A payout of ${inr(p.net_payable)} was returned by the boutique's bank after it was credited (${reason}). Check the boutique's bank details and pay it again.`,
      );
    }
    return "failed";
  }
  await supabase.from("vendor_payouts").update(base).eq("id", p.id);
  return e.status;
}

// Backup to the webhooks: asks RazorpayX about payouts still on their way.
export async function syncProcessingPayouts(supabase: SupabaseClient): Promise<number> {
  const { data: open } = await supabase.from("vendor_payouts").select("rzpx_payout_id").eq("status", "processing").not("rzpx_payout_id", "is", null);
  let n = 0;
  for (const p of open ?? []) {
    try {
      await applyPayoutEntity(supabase, await rzpx("GET", `/v1/payouts/${p.rzpx_payout_id}`));
      n++;
    } catch (e) {
      console.error("syncProcessingPayouts", p.rzpx_payout_id, errorMessage(e));
    }
  }
  return n;
}

// Available balance of the RazorpayX account (₹), from its latest
// transaction.
export async function xBalance(): Promise<number | null> {
  if (!xAccountNumber()) return null;
  const res = await rzpx("GET", `/v1/transactions?account_number=${encodeURIComponent(xAccountNumber())}&count=1`);
  const t = res?.items?.[0];
  return typeof t?.balance === "number" ? t.balance / 100 : 0;
}
