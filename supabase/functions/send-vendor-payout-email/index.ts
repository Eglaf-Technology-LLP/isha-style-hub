import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, emailTemplate } from "../_shared/email.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Called only by the database (payout triggers / daily queue job, through
// invoke_edge_function) with the service-role key. verify_jwt has already
// checked the signature; this rejects any other (user) token.
function isServiceRoleCall(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const payload = token.split(".")[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

const PAYOUTS_URL = "https://allboutiqs.com/vendor?tab=payouts";
const inr = (n: number) => `₹${Math.round(Number(n)).toLocaleString("en-IN")}`;
const day = (d: string) =>
  new Date(d.length === 10 ? `${d}T00:00:00+05:30` : d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
const p = (html: string) => `<p style="color:#5a5a5a;">${html}</p>`;
const factsBox = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f2; border-radius:8px; padding:16px; margin:16px 0; font-size:14px;">${rows
    .map(([k, v]) => `<tr><td style="padding:3px 0;"><strong>${k}:</strong> ${v}</td></tr>`)
    .join("")}</table>`;

interface Vendor {
  id: string;
  name: string;
  contact_email: string | null;
  owner_user_id: string | null;
  payout_account_status: string;
}

async function loadVendor(supabase: SupabaseClient, vendorId: string) {
  const [{ data: vendor }, { data: account }] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, contact_email, owner_user_id, payout_account_status")
      .eq("id", vendorId)
      .maybeSingle(),
    supabase
      .from("vendor_payout_accounts")
      .select("account_holder_name, bank_account_number, bank_ifsc")
      .eq("vendor_id", vendorId)
      .maybeSingle(),
  ]);
  return { vendor: vendor as Vendor | null, account };
}

async function vendorEmail(supabase: SupabaseClient, vendor: Vendor): Promise<string | null> {
  if (vendor.contact_email) return vendor.contact_email;
  if (!vendor.owner_user_id) return null;
  const { data } = await supabase.auth.admin.getUserById(vendor.owner_user_id);
  return data.user?.email ?? null;
}

const last4 = (acct: string | null | undefined) => (acct ? acct.replace(/\s/g, "").slice(-4) : null);

// Why a boutique's queued money can't be paid yet, or null if it can.
function blockedReason(vendor: Vendor, account: unknown): string | null {
  if (!account || vendor.payout_account_status === "not_setup") return "your payout account isn't set up yet";
  if (vendor.payout_account_status === "needs_update") return "your bank declined the last transfer";
  if (vendor.payout_account_status === "disabled") return "payouts are paused for your boutique";
  return null;
}

type Built = { subject: string; heading: string; preheader: string; bodyHtml: string; ctaLabel: string };

serve(async (req) => {
  if (!isServiceRoleCall(req)) return json({ error: "Forbidden" }, 403);

  try {
    const body = await req.json();
    const event: string = body.event ?? "delivered";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let vendorId: string | undefined = body.vendor_id;
    let built: Built;

    if (event === "delivered") {
      const { data: vo } = await supabase
        .from("vendor_orders")
        .select("id, order_id, vendor_id, net_payable, payout_eligible_on")
        .eq("id", body.vendor_order_id)
        .maybeSingle();
      if (!vo?.payout_eligible_on) return json({ error: "Vendor order not delivered/scheduled" }, 404);
      vendorId = vo.vendor_id;
      const { vendor, account } = await loadVendor(supabase, vo.vendor_id);
      if (!vendor) return json({ error: "Vendor not found" }, 404);
      const { data: holdDays } = await supabase.rpc("vendor_order_payout_hold_days", { _vendor_order_id: vo.id });
      const hold = Number(holdDays ?? 0);
      const ref = `#${String(vo.order_id).slice(0, 8)}`;
      const blocked = blockedReason(vendor, account);
      const why =
        hold > 0
          ? `This is after the ${hold}-day return window, so any return can be settled before you're paid.`
          : "Nothing in this order is returnable, so there's no return-window wait.";
      built = blocked
        ? {
            subject: `Action needed: add your payout account to receive ${inr(vo.net_payable)} | AllBoutiqs`,
            heading: "Add your payout account to get paid",
            preheader: `${inr(vo.net_payable)} is due to you on ${day(vo.payout_eligible_on)}`,
            bodyHtml:
              p(`Hi ${vendor.name}, order <strong>${ref}</strong> has been delivered and <strong>${inr(vo.net_payable)}</strong> is due to you on <strong>${day(vo.payout_eligible_on)}</strong>.`) +
              p(`But ${blocked}, so we can't send this money yet. It will wait safely in your payout queue until you add your bank details.`),
            ctaLabel: "Set up payout account",
          }
        : {
            subject: `Order ${ref} delivered - payout of ${inr(vo.net_payable)} on ${day(vo.payout_eligible_on)} | AllBoutiqs`,
            heading: "Your order was delivered",
            preheader: `Payout of ${inr(vo.net_payable)} scheduled for ${day(vo.payout_eligible_on)}`,
            bodyHtml:
              p(`Hi ${vendor.name}, order <strong>${ref}</strong> has been delivered to the customer.`) +
              factsBox([
                ["Payout amount", inr(vo.net_payable)],
                ["Scheduled for", day(vo.payout_eligible_on)],
              ]) +
              p(`${why} The amount is after AllBoutiqs commission.`),
            ctaLabel: "View payouts",
          };
    } else if (event === "queued") {
      const { vendor, account } = await loadVendor(supabase, body.vendor_id);
      if (!vendor) return json({ error: "Vendor not found" }, 404);
      const { data: orders } = await supabase
        .from("vendor_orders")
        .select("order_id, net_payable")
        .in("id", body.vendor_order_ids ?? []);
      const total = (orders ?? []).reduce((s, o) => s + Number(o.net_payable), 0);
      const list = `<ul style="margin:0; padding-left:20px; color:#3a3a3a;">${(orders ?? [])
        .map((o) => `<li>Order #${String(o.order_id).slice(0, 8)} - ${inr(o.net_payable)}</li>`)
        .join("")}</ul>`;
      const blocked = blockedReason(vendor, account);
      built = blocked
        ? {
            subject: `${inr(total)} is ready to pay - bank details needed | AllBoutiqs`,
            heading: "Your payout is ready, but we can't send it yet",
            preheader: `${inr(total)} is waiting for your bank details`,
            bodyHtml:
              p(`Hi ${vendor.name}, the return window has ended for these orders, so this money is now ready to pay:`) +
              list +
              p(`But ${blocked}. Please update your payout details - we'll include it in the next payout run after that.`),
            ctaLabel: "Update payout details",
          }
        : {
            subject: `${inr(total)} is in the queue for your next bank transfer | AllBoutiqs`,
            heading: "Your payout is in the queue",
            preheader: `${inr(total)} will be in your next bank transfer`,
            bodyHtml:
              p(`Hi ${vendor.name}, the return window has ended for these orders, so this money is now in the queue for your next bank transfer:`) +
              list +
              factsBox([
                ["Total", inr(total)],
                ["Goes to", `${account ? `account ending ${last4((account as any).bank_account_number)}` : "your bank account"}`],
              ]) +
              p("You'll get another email when the transfer starts and when it's credited."),
            ctaLabel: "View payouts",
          };
    } else if (event === "processing" || event === "credited" || event === "failed") {
      const { data: payout } = await supabase
        .from("vendor_payouts")
        .select("vendor_id, net_payable, order_count, bank_account_last4, payment_reference, paid_at, failure_reason")
        .eq("id", body.payout_id)
        .maybeSingle();
      if (!payout) return json({ error: "Payout not found" }, 404);
      vendorId = payout.vendor_id;
      const { vendor, account } = await loadVendor(supabase, payout.vendor_id);
      if (!vendor) return json({ error: "Vendor not found" }, 404);
      const acct = payout.bank_account_last4 ? `account ending ${payout.bank_account_last4}` : "your bank account";
      if (event === "processing") {
        built = {
          subject: `Payout of ${inr(payout.net_payable)} is being processed | AllBoutiqs`,
          heading: "Your payout is being processed",
          preheader: `${inr(payout.net_payable)} is on its way to ${acct}`,
          bodyHtml:
            p(`Hi ${vendor.name}, we've started the bank transfer for your delivered orders.`) +
            factsBox([
              ["Amount", inr(payout.net_payable)],
              ["Orders", String(payout.order_count)],
              ["To", `${acct}${account ? ` (IFSC ${(account as any).bank_ifsc})` : ""}`],
            ]) +
            p("Bank transfers usually arrive within 1-2 working days. We'll email you again with the bank reference once it's credited."),
          ctaLabel: "View payouts",
        };
      } else if (event === "credited") {
        built = {
          subject: `${inr(payout.net_payable)} credited to your bank account | AllBoutiqs`,
          heading: "Payout credited",
          preheader: `${inr(payout.net_payable)} credited - UTR ${payout.payment_reference}`,
          bodyHtml:
            p(`Hi ${vendor.name}, your payout has been credited.`) +
            factsBox([
              ["Amount", inr(payout.net_payable)],
              ["Credited to", acct],
              ["Date", payout.paid_at ? day(payout.paid_at) : day(new Date().toISOString())],
              ["Bank reference (UTR)", payout.payment_reference ?? "-"],
            ]) +
            p("You can match this UTR number with the credit on your bank statement. If you can't find it within 2 working days, reply to this email."),
          ctaLabel: "View payout history",
        };
      } else {
        built = {
          subject: `Action needed: your bank declined a payout of ${inr(payout.net_payable)} | AllBoutiqs`,
          heading: "Your bank declined the payout",
          preheader: `Update your bank details to receive ${inr(payout.net_payable)}`,
          bodyHtml:
            p(`Hi ${vendor.name}, we tried to transfer <strong>${inr(payout.net_payable)}</strong> to ${acct}, but the bank declined it.`) +
            factsBox([["Reason", payout.failure_reason ?? "Not given by the bank"]]) +
            p("Your money is safe - it's back in your payout queue. Please check and update your bank account details; we'll send it in the next payout run after you do."),
          ctaLabel: "Update bank details",
        };
      }
    } else if (event === "released" || event === "route_credited" || event === "transfer_failed") {
      const { vendor } = await loadVendor(supabase, body.vendor_id);
      if (!vendor) return json({ error: "Vendor not found" }, 404);
      const { data: orders } = await supabase
        .from("vendor_orders")
        .select("order_id, net_payable, rzp_transfer_amount, rzp_settlement_utr, rzp_settled_at")
        .in("id", body.vendor_order_ids ?? []);
      const rows = orders ?? [];
      const amountOf = (o: any) => Number(o.rzp_transfer_amount ?? o.net_payable);
      const total = rows.reduce((s, o) => s + amountOf(o), 0);
      const list = `<ul style="margin:0; padding-left:20px; color:#3a3a3a;">${rows
        .map((o) => `<li>Order #${String(o.order_id).slice(0, 8)} - ${inr(amountOf(o))}</li>`)
        .join("")}</ul>`;
      if (event === "released") {
        built = {
          subject: `${inr(total)} is on its way to your bank | AllBoutiqs`,
          heading: "Your payout has been sent",
          preheader: `${inr(total)} released through Razorpay`,
          bodyHtml:
            p(`Hi ${vendor.name}, the return window is over, so we've released your payout through Razorpay:`) +
            list +
            p("Razorpay usually credits your bank within 2 working days. We'll email you again with the bank reference (UTR) once it's credited."),
          ctaLabel: "View payouts",
        };
      } else if (event === "route_credited") {
        const utr = rows.find((o) => o.rzp_settlement_utr)?.rzp_settlement_utr;
        built = {
          subject: `${inr(total)} credited to your bank account | AllBoutiqs`,
          heading: "Payout credited",
          preheader: `${inr(total)} credited${utr ? ` - UTR ${utr}` : ""}`,
          bodyHtml:
            p(`Hi ${vendor.name}, Razorpay has credited your payout to your bank account:`) +
            list +
            factsBox([
              ["Total", inr(total)],
              ["Bank reference (UTR)", utr ?? "Shown in your Razorpay settlement"],
            ]) +
            p("Match the UTR with the credit on your bank statement."),
          ctaLabel: "View payout history",
        };
      } else {
        built = {
          subject: `Payout delayed for ${inr(total)} | AllBoutiqs`,
          heading: "Your payout was delayed",
          preheader: "Razorpay couldn't complete a payout - we'll retry",
          bodyHtml:
            p(`Hi ${vendor.name}, Razorpay couldn't complete this payout:`) +
            list +
            factsBox([["Reason", String(body.reason ?? "Not given")]]) +
            p("Your money is safe. We retry automatically every day; if the reason is about your bank details, please update them in your Payouts tab."),
          ctaLabel: "View payouts",
        };
      }
    } else if (event === "account_activated" || event === "account_needs_clarification") {
      const { vendor } = await loadVendor(supabase, body.vendor_id);
      if (!vendor) return json({ error: "Vendor not found" }, 404);
      built =
        event === "account_activated"
          ? {
              subject: "Your bank account is verified - payouts are automatic | AllBoutiqs",
              heading: "Bank account verified",
              preheader: "Razorpay verified your payout bank account",
              bodyHtml:
                p(`Hi ${vendor.name}, Razorpay has verified your bank account.`) +
                p("From now on, each order's payout is sent to your bank automatically once its return window ends. You'll get an email at every step."),
              ctaLabel: "View payouts",
            }
          : {
              subject: "Action needed: Razorpay couldn't verify your bank details | AllBoutiqs",
              heading: "Your bank details need attention",
              preheader: "Update your payout details to receive payouts",
              bodyHtml:
                p(`Hi ${vendor.name}, Razorpay couldn't verify your payout details, so payouts are paused.`) +
                factsBox([["Reason", String(body.reason || "Verification failed")]]) +
                p("Please correct your bank account / PAN details in your Payouts tab. Your money stays safe until then."),
              ctaLabel: "Update payout details",
            };
    } else if (event === "account_updated") {
      const { vendor, account } = await loadVendor(supabase, body.vendor_id);
      if (!vendor || !account) return json({ error: "Vendor/account not found" }, 404);
      const a = account as { account_holder_name: string; bank_account_number: string; bank_ifsc: string };
      built = {
        subject: "Your payout bank details were updated | AllBoutiqs",
        heading: "Payout bank details updated",
        preheader: `Payouts will now go to account ending ${last4(a.bank_account_number)}`,
        bodyHtml:
          p(`Hi ${vendor.name}, your payout bank details were just saved. From now on, payouts will go to:`) +
          factsBox([
            ["Account holder", a.account_holder_name],
            ["Account", `ending ${last4(a.bank_account_number)}`],
            ["IFSC", a.bank_ifsc],
          ]) +
          p("<strong>If you didn't make this change, contact us immediately at hello@allboutiqs.com</strong> so we can stop any transfers."),
        ctaLabel: "Review payout details",
      };
    } else if (event === "account_reminder") {
      const { vendor, account } = await loadVendor(supabase, body.vendor_id);
      if (!vendor) return json({ error: "Vendor not found" }, 404);
      const { data: waiting } = await supabase
        .from("vendor_orders")
        .select("net_payable, payout_eligible_on")
        .eq("vendor_id", body.vendor_id)
        .eq("status", "delivered")
        .is("payout_id", null);
      const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
      const due = (waiting ?? []).filter((o) => o.payout_eligible_on && o.payout_eligible_on <= today);
      const total = due.reduce((s, o) => s + Number(o.net_payable), 0);
      built = {
        subject: `Reminder: ${inr(total)} is waiting for your bank details | AllBoutiqs`,
        heading: "Money is waiting for you",
        preheader: `${inr(total)} can't be sent until you update your payout details`,
        bodyHtml:
          p(`Hi ${vendor.name}, <strong>${inr(total)}</strong> from ${due.length} delivered order(s) is ready to pay, but ${blockedReason(vendor, account) ?? "we couldn't send it"}.`) +
          p("Add or correct your bank account details in your dashboard and we'll include it in the next payout run."),
        ctaLabel: "Update payout details",
      };
    } else {
      return json({ error: `Unknown event ${event}` }, 400);
    }

    const { vendor } = await loadVendor(supabase, vendorId!);
    const to = vendor ? await vendorEmail(supabase, vendor) : null;
    if (!to) return json({ sent: false, reason: "no email for vendor" });

    const html = emailTemplate({
      heading: built.heading,
      preheader: built.preheader,
      bodyHtml: built.bodyHtml,
      ctaLabel: built.ctaLabel,
      ctaUrl: PAYOUTS_URL,
    });
    const result = await sendEmail(to, built.subject, html);
    return json({ event, sent: !result.skipped, to_domain: to.split("@")[1] });
  } catch (error: any) {
    console.error("send-vendor-payout-email error:", error);
    return json({ error: error.message }, 500);
  }
});
