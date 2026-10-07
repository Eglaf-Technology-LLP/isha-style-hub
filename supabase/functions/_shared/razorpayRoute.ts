import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { AppError, errorMessage } from "./auth.ts";

// Automatic boutique payouts through Razorpay Route. See migration
// 20261007100000_razorpay_route_payouts.sql for the overall flow.

const RZP = "https://api.razorpay.com";
const OPEN_RETURN_STATUSES = ["pending", "approved", "picked_up", "pickup_failed"];

export async function rzp(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<any> {
  const id = Deno.env.get("RAZORPAY_KEY_ID");
  const secret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!id || !secret) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
  const res = await fetch(`${RZP}${path}`, {
    method,
    headers: {
      Authorization: "Basic " + btoa(`${id}:${secret}`),
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError(res.status, `Razorpay ${path} failed`, data);
  return data;
}

const paise = (rupees: number) => Math.round(Number(rupees) * 100);
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Linked-account verification state -> the boutique-facing account status
// the rest of the payout system (queue alerts, banners) already uses.
const VENDOR_STATUS_FOR: Record<string, string> = {
  activated: "active",
  created: "pending",
  under_review: "pending",
  needs_clarification: "needs_update",
  failed: "needs_update",
};

function mapActivation(status: string | undefined): string {
  if (status === "activated" || status === "under_review" || status === "needs_clarification") return status;
  return "created";
}

// ---------- notifications ----------

export async function notifyVendor(
  supabase: SupabaseClient,
  vendorId: string,
  type: string,
  title: string,
  body: string,
  email?: Record<string, unknown>,
) {
  const { data: members } = await supabase.from("vendor_members").select("user_id").eq("vendor_id", vendorId);
  if (members?.length) {
    await supabase.from("notifications").insert(
      members.map((m) => ({ user_id: m.user_id, category: "order", type, title, body, link_url: "/vendor?tab=payouts" })),
    );
  }
  if (email) {
    const { error } = await supabase.functions.invoke("send-vendor-payout-email", { body: { vendor_id: vendorId, ...email } });
    if (error) console.error("payout email failed", type, error);
  }
}

export async function notifyAdmins(supabase: SupabaseClient, type: string, title: string, body: string) {
  const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  if (admins?.length) {
    await supabase.from("notifications").insert(
      admins.map((a) => ({ user_id: a.user_id, category: "other", type, title, body, link_url: "/admin" })),
    );
  }
}

// ---------- onboarding ----------

export interface OnboardResult {
  razorpay_status: string;
  razorpay_error: string | null;
  requirements: unknown;
}

// Creates the boutique's Razorpay linked account (with its bank account as
// the settlement destination) or, if it already exists, updates the bank
// account. Razorpay then verifies the bank (penny drop, ~10-15 min) and
// reports back via product.route.* webhooks.
export async function onboardVendor(supabase: SupabaseClient, vendorId: string): Promise<OnboardResult> {
  const [{ data: vendor }, { data: account }] = await Promise.all([
    supabase.from("vendors").select("id, name, boutique_code, contact_email, contact_phone, owner_user_id").eq("id", vendorId).single(),
    supabase.from("vendor_payout_accounts").select("*").eq("vendor_id", vendorId).maybeSingle(),
  ]);
  if (!account) throw new Error("Add your bank details first");

  const fail = async (message: string): Promise<OnboardResult> => {
    await supabase
      .from("vendor_payout_accounts")
      .update({ razorpay_status: account.razorpay_account_id ? account.razorpay_status : "failed", razorpay_error: message, razorpay_synced_at: new Date().toISOString() })
      .eq("vendor_id", vendorId);
    if (!account.razorpay_account_id) {
      await supabase.from("vendors").update({ payout_account_status: "needs_update" }).eq("id", vendorId);
    }
    return { razorpay_status: account.razorpay_account_id ? account.razorpay_status : "failed", razorpay_error: message, requirements: null };
  };

  const pan = String(account.pan ?? "").trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return fail("A valid PAN (e.g. ABCDE1234F) is required by Razorpay");
  let email = vendor.contact_email as string | null;
  if (!email && vendor.owner_user_id) {
    const { data } = await supabase.auth.admin.getUserById(vendor.owner_user_id);
    email = data.user?.email ?? null;
  }
  const phone = String(vendor.contact_phone ?? "").replace(/[^\d+]/g, "");
  if (!email) return fail("Add a contact email in Store settings - Razorpay needs it");
  if (phone.replace(/\D/g, "").length < 10) return fail("Add a 10-digit contact phone in Store settings - Razorpay needs it");

  const accountNumber = String(account.bank_account_number).replace(/\s/g, "");
  const ifsc = String(account.bank_ifsc).trim().toUpperCase();
  const beneficiary = String(account.account_holder_name).trim();

  try {
    let accountId = account.razorpay_account_id as string | null;
    let productId = account.razorpay_product_id as string | null;
    let activation: string | undefined;
    let requirements: unknown = null;

    if (!accountId) {
      const body = {
        type: "route",
        tnc_accepted: true,
        reference_id: `${vendor.boutique_code ?? "AB"}-${vendorId.slice(0, 8)}`,
        legal_business_name: (account.legal_business_name || beneficiary).trim(),
        customer_facing_business_name: vendor.name,
        business_type: account.business_type,
        email,
        phone,
        legal_info: { pan },
        notes: { vendor_id: vendorId },
        settlement_accounts: [
          {
            method: "bank_account",
            bank_account: {
              account_number: accountNumber,
              beneficiary_name: beneficiary,
              code_type: "ifsc",
              code: ifsc,
              currency: "INR",
              is_default: true,
            },
          },
        ],
      };
      const key = `onboard-${vendorId}-${(await sha256Hex(JSON.stringify(body))).slice(0, 24)}`;
      const res = await rzp("POST", "/v2/accounts", body, key);
      accountId = res.id;
      productId = res.product_config?.id ?? null;
      activation = res.product_config?.activation_status;
      requirements = res.product_config?.requirements ?? null;
    } else if (productId) {
      const res = await rzp("PATCH", `/v2/accounts/${accountId}/products/${productId}/`, {
        settlements: { account_number: accountNumber, ifsc_code: ifsc, beneficiary_name: beneficiary },
        tnc_accepted: true,
      });
      activation = res.activation_status;
      requirements = res.requirements ?? null;
    }

    const status = mapActivation(activation);
    await supabase
      .from("vendor_payout_accounts")
      .update({
        razorpay_account_id: accountId,
        razorpay_product_id: productId,
        razorpay_status: status,
        razorpay_requirements: requirements,
        razorpay_error: null,
        razorpay_synced_at: new Date().toISOString(),
      })
      .eq("vendor_id", vendorId);
    await supabase.from("vendors").update({ payout_account_status: VENDOR_STATUS_FOR[status] ?? "pending" }).eq("id", vendorId);
    return { razorpay_status: status, razorpay_error: null, requirements };
  } catch (e) {
    // Route not enabled / bad platform keys is our problem, not the
    // boutique's - don't flag its details as wrong or nag it to fix them.
    const status = e instanceof AppError ? e.status : 0;
    const msg = errorMessage(e);
    if (status === 401 || /requested URL was not found|not enabled|feature/i.test(msg)) {
      const platformMsg = "Automatic payouts are being switched on by AllBoutiqs - your details are saved and will be verified then.";
      await supabase
        .from("vendor_payout_accounts")
        .update({ razorpay_error: platformMsg, razorpay_synced_at: new Date().toISOString() })
        .eq("vendor_id", vendorId);
      await notifyAdmins(supabase, "payout_platform_error", "Razorpay Route isn't available", `Onboarding ${vendor.name} failed: ${msg}. Enable Route (and Direct Transfers) in the Razorpay dashboard.`);
      return { razorpay_status: account.razorpay_status ?? "not_created", razorpay_error: platformMsg, requirements: null };
    }
    return fail(msg);
  }
}

// ---------- transfers ----------

type PayableAccount = { razorpay_account_id: string; razorpay_status: string };
const usable = (a: PayableAccount | undefined | null) =>
  !!a?.razorpay_account_id && !["needs_clarification", "failed", "not_created"].includes(a.razorpay_status);

// On payment capture: move each boutique's share into its linked account,
// held until we release it after delivery + the return window.
export async function createHeldTransfers(supabase: SupabaseClient, orderId: string, rzpPaymentId: string) {
  const { data: vos } = await supabase
    .from("vendor_orders")
    .select("id, vendor_id, net_payable, status")
    .eq("order_id", orderId)
    .is("rzp_transfer_id", null)
    .neq("status", "cancelled");
  if (!vos?.length) return;
  const { data: accounts } = await supabase
    .from("vendor_payout_accounts")
    .select("vendor_id, razorpay_account_id, razorpay_status")
    .in("vendor_id", vos.map((v) => v.vendor_id));
  const byVendor = new Map((accounts ?? []).map((a) => [a.vendor_id, a as PayableAccount]));
  const candidates = vos.filter((v) => usable(byVendor.get(v.vendor_id)) && paise(v.net_payable) >= 100);
  if (!candidates.length) return;

  // verify-razorpay-payment and the payment.captured webhook can both get
  // here at once; claiming the rows atomically means only one of them ever
  // creates transfers (a duplicate would pay the boutique twice).
  const { data: claimed } = await supabase
    .from("vendor_orders")
    .update({ rzp_transfer_kind: "payment" })
    .in("id", candidates.map((v) => v.id))
    .is("rzp_transfer_kind", null)
    .is("rzp_transfer_id", null)
    .select("id");
  const claimedIds = new Set((claimed ?? []).map((c) => c.id));
  const eligible = candidates.filter((v) => claimedIds.has(v.id));
  if (!eligible.length) return;

  try {
    const res = await rzp("POST", `/v1/payments/${rzpPaymentId}/transfers`, {
      transfers: eligible.map((v) => ({
        account: byVendor.get(v.vendor_id)!.razorpay_account_id,
        amount: paise(v.net_payable),
        currency: "INR",
        on_hold: true,
        notes: { vendor_order_id: v.id, order_id: orderId },
      })),
    });
    const items: any[] = res.items ?? [];
    for (let i = 0; i < eligible.length; i++) {
      const t = items.find((x) => x.notes?.vendor_order_id === eligible[i].id) ?? items[i];
      if (!t?.id) continue;
      await supabase
        .from("vendor_orders")
        .update({ rzp_transfer_id: t.id, rzp_transfer_kind: "payment", rzp_transfer_status: "held", rzp_transfer_amount: Number(eligible[i].net_payable), rzp_transfer_error: null })
        .eq("id", eligible[i].id);
    }
  } catch (e) {
    // Never blocks the payment itself - the release job falls back to a
    // direct transfer from balance on the payout date.
    const msg = errorMessage(e);
    console.error("createHeldTransfers failed", orderId, msg);
    await supabase
      .from("vendor_orders")
      .update({ rzp_transfer_error: msg, rzp_transfer_kind: null })
      .in("id", eligible.map((v) => v.id))
      .is("rzp_transfer_id", null);
  }
}

export interface ReleaseSummary {
  released: { vendor_order_id: string; amount: number; kind: string }[];
  skipped: { vendor_order_id: string; reason: string }[];
  failed: { vendor_order_id: string; error: string }[];
  settled: number;
}

// Daily (and on demand from the admin panel): release every payout whose
// date has arrived. Held payment transfers are un-held; COD orders (and
// online orders whose boutique onboarded after payment) get a direct
// transfer from the platform's Razorpay balance.
export async function releaseDuePayouts(supabase: SupabaseClient): Promise<ReleaseSummary> {
  const summary: ReleaseSummary = { released: [], skipped: [], failed: [], settled: 0 };
  const today = todayIst();

  const { data: due } = await supabase
    .from("vendor_orders")
    .select("id, order_id, vendor_id, net_payable, rzp_transfer_id, rzp_transfer_kind, rzp_transfer_status, rzp_reversed_amount, orders(payment_method, payment_status)")
    .eq("status", "delivered")
    .is("payout_id", null)
    .lte("payout_eligible_on", today)
    .or("rzp_transfer_status.is.null,rzp_transfer_status.eq.held,rzp_transfer_status.eq.failed");

  if (due?.length) {
    const { data: openReturns } = await supabase.from("return_requests").select("items").in("status", OPEN_RETURN_STATUSES);
    const itemIds = (openReturns ?? []).flatMap((r) => ((r.items as any[]) ?? []).map((i) => i.order_item_id).filter(Boolean));
    const { data: openItems } = itemIds.length
      ? await supabase.from("order_items").select("vendor_order_id").in("id", itemIds)
      : { data: [] as { vendor_order_id: string | null }[] };
    const withOpenReturn = new Set((openItems ?? []).map((i) => i.vendor_order_id));

    const { data: accounts } = await supabase
      .from("vendor_payout_accounts")
      .select("vendor_id, razorpay_account_id, razorpay_status")
      .in("vendor_id", [...new Set(due.map((d) => d.vendor_id))]);
    const byVendor = new Map((accounts ?? []).map((a) => [a.vendor_id, a as PayableAccount]));

    for (const vo of due as any[]) {
      const order = Array.isArray(vo.orders) ? vo.orders[0] : vo.orders;
      const amount = Math.max(0, Number(vo.net_payable) - Number(vo.rzp_reversed_amount ?? 0));
      if (withOpenReturn.has(vo.id)) {
        summary.skipped.push({ vendor_order_id: vo.id, reason: "open return request" });
        continue;
      }
      if (order?.payment_status !== "paid") {
        summary.skipped.push({ vendor_order_id: vo.id, reason: order?.payment_method === "cod" ? "COD cash not yet marked received" : "order not paid" });
        continue;
      }
      const account = byVendor.get(vo.vendor_id);
      if (!usable(account)) {
        summary.skipped.push({ vendor_order_id: vo.id, reason: "boutique has no verified Razorpay payout account" });
        continue;
      }
      if (paise(amount) < 100) {
        summary.skipped.push({ vendor_order_id: vo.id, reason: "amount below Razorpay's ₹1 minimum" });
        continue;
      }
      try {
        let transferId = vo.rzp_transfer_id;
        let kind = vo.rzp_transfer_kind ?? "direct";
        if (vo.rzp_transfer_id && vo.rzp_transfer_kind === "payment" && vo.rzp_transfer_status === "held") {
          await rzp("PATCH", `/v1/transfers/${vo.rzp_transfer_id}`, { on_hold: false });
        } else {
          const t = await rzp(
            "POST",
            "/v1/transfers",
            { account: account!.razorpay_account_id, amount: paise(amount), currency: "INR", notes: { vendor_order_id: vo.id, order_id: vo.order_id } },
            `release-${vo.id}-${today}`,
          );
          transferId = t.id;
          kind = "direct";
        }
        await supabase
          .from("vendor_orders")
          .update({
            rzp_transfer_id: transferId,
            rzp_transfer_kind: kind,
            rzp_transfer_status: "released",
            rzp_transfer_amount: amount,
            rzp_transfer_error: null,
            rzp_released_at: new Date().toISOString(),
          })
          .eq("id", vo.id);
        summary.released.push({ vendor_order_id: vo.id, amount, kind });
        await notifyVendor(
          supabase,
          vo.vendor_id,
          "payout_released",
          "Payout sent to your bank",
          `₹${Math.round(amount)} for order #${String(vo.order_id).slice(0, 8)} was released through Razorpay. It usually reaches your bank within 2 working days.`,
          { event: "released", vendor_order_ids: [vo.id] },
        );
      } catch (e) {
        const msg = errorMessage(e);
        await supabase
          .from("vendor_orders")
          .update({ rzp_transfer_error: msg, ...(vo.rzp_transfer_kind === "payment" ? {} : { rzp_transfer_status: "failed" }) })
          .eq("id", vo.id);
        summary.failed.push({ vendor_order_id: vo.id, error: msg });
        await notifyAdmins(supabase, "payout_transfer_failed", "Razorpay payout failed", `Order #${String(vo.order_id).slice(0, 8)}: ${msg}`);
      }
    }
  }

  summary.settled = await reconcileSettlements(supabase);
  return summary;
}

// Backup to the settlement webhook: ask Razorpay whether released
// transfers have reached the boutique's bank yet.
export async function reconcileSettlements(supabase: SupabaseClient, settlementId?: string, utr?: string | null, linkedAccountId?: string): Promise<number> {
  let query = supabase
    .from("vendor_orders")
    .select("id, order_id, vendor_id, rzp_transfer_id, rzp_transfer_amount")
    .eq("rzp_transfer_status", "released")
    .is("rzp_settled_at", null)
    .not("rzp_transfer_id", "is", null);
  if (linkedAccountId) {
    const { data: acct } = await supabase.from("vendor_payout_accounts").select("vendor_id").eq("razorpay_account_id", linkedAccountId).maybeSingle();
    if (!acct) return 0;
    query = query.eq("vendor_id", acct.vendor_id);
  }
  const { data: released } = await query;
  let count = 0;
  for (const vo of released ?? []) {
    try {
      const t = await rzp("GET", `/v1/transfers/${vo.rzp_transfer_id}`);
      if (t.settlement_status !== "settled") continue;
      if (settlementId && t.recipient_settlement_id && t.recipient_settlement_id !== settlementId) continue;
      const sid = t.recipient_settlement_id ?? settlementId ?? null;
      await supabase
        .from("vendor_orders")
        .update({ rzp_settlement_id: sid, rzp_settlement_utr: sid === settlementId ? (utr ?? null) : null, rzp_settled_at: new Date().toISOString() })
        .eq("id", vo.id);
      count++;
      await notifyVendor(
        supabase,
        vo.vendor_id,
        "payout_credited",
        "Payout credited",
        `₹${Math.round(Number(vo.rzp_transfer_amount))} for order #${String(vo.order_id).slice(0, 8)} was credited to your bank${sid === settlementId && utr ? `. Bank reference (UTR): ${utr}` : ""}.`,
        { event: "route_credited", vendor_order_ids: [vo.id] },
      );
    } catch (e) {
      console.error("reconcileSettlements: transfer check failed", vo.rzp_transfer_id, errorMessage(e));
    }
  }
  return count;
}

// Before refunding a customer, take the boutique's share of the refunded
// amount back from its linked account (only possible while Razorpay still
// holds it; after it reaches the boutique's bank this can fail, in which
// case the refund still goes ahead and admins are alerted).
export async function reverseVendorShare(supabase: SupabaseClient, vendorOrderId: string, refundAmount: number) {
  const { data: vo } = await supabase
    .from("vendor_orders")
    .select("id, order_id, subtotal, shipping_cost, net_payable, rzp_transfer_id, rzp_transfer_status, rzp_transfer_amount, rzp_reversed_amount")
    .eq("id", vendorOrderId)
    .maybeSingle();
  if (!vo?.rzp_transfer_id || !["held", "released"].includes(vo.rzp_transfer_status ?? "")) return;
  const gross = Number(vo.subtotal) + Number(vo.shipping_cost);
  const transferred = Number(vo.rzp_transfer_amount ?? vo.net_payable);
  const remaining = transferred - Number(vo.rzp_reversed_amount ?? 0);
  const share = Math.min(remaining, gross > 0 ? (refundAmount * Number(vo.net_payable)) / gross : 0);
  if (paise(share) < 100) return;
  try {
    await rzp("POST", `/v1/transfers/${vo.rzp_transfer_id}/reversals`, { amount: paise(share), notes: { reason: "customer refund" } });
    const reversed = Number(vo.rzp_reversed_amount ?? 0) + Math.round(share * 100) / 100;
    await supabase
      .from("vendor_orders")
      .update({ rzp_reversed_amount: reversed, ...(reversed >= transferred - 0.01 ? { rzp_transfer_status: "reversed" } : {}) })
      .eq("id", vo.id);
  } catch (e) {
    const msg = errorMessage(e);
    console.error("reverseVendorShare failed", vendorOrderId, msg);
    await notifyAdmins(
      supabase,
      "payout_reversal_failed",
      "Couldn't recover a boutique payout",
      `Refund on order #${String(vo.order_id).slice(0, 8)}: reversing ₹${Math.round(share)} from the boutique failed (${msg}). Recover it manually.`,
    );
  }
}

export { VENDOR_STATUS_FOR };
