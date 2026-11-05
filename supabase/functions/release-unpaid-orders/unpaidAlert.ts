import { emailTemplate, sendEmail } from "../_shared/email.ts";
import { formatDateTime } from "../_shared/dates.ts";
import { money } from "../_shared/money.ts";
import type { serviceClient } from "../_shared/auth.ts";

// Extra list from the client (C): a customer who reached the payment window
// but didn't pay -> one email to every admin with who they are and what they
// were buying, so AllBoutiqs can call them. Sent once the customer has been
// quiet for QUIET_MINUTES (no open checkout, no try since), so a retry that
// goes through alerts nobody and several tries in a row come as one email.
// Only checkouts that opened Razorpay count (razorpay_order_id set) - one
// that failed earlier (e.g. stock ran out) never reached payment.

type Supabase = ReturnType<typeof serviceClient>;

const QUIET_MINUTES = 30;
// Older checkouts are never reported late (e.g. after the cron was down).
const LOOKBACK_HOURS = 48;
const ADMIN_ORDERS_URL = "https://allboutiqs.com/admin?tab=orders";

const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const isPlaced = (o: { payment_method: string; payment_status: string }) =>
  o.payment_method === "cod" || ["paid", "refunded"].includes(o.payment_status);

async function adminEmails(supabase: Supabase): Promise<string[]> {
  const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const emails = await Promise.all(
    (roles ?? []).map(async (r) => {
      const { data, error } = await supabase.auth.admin.getUserById(r.user_id);
      return error ? null : data.user?.email ?? null;
    }),
  );
  return emails.filter((e): e is string => !!e);
}

// What Razorpay saw for one checkout, in words.
function paymentStory(payments: any[]): string {
  const failed = payments.filter((p) => p.status === "failed");
  if (!failed.length) return "No payment was attempted - the payment window was closed.";
  return failed
    .map((p) => {
      const method = [p.method, p.bank || p.wallet || p.vpa].filter(Boolean).join(" ").toUpperCase();
      return `${method || "Payment"} failed: ${p.error_description || p.error_reason || "no reason given"}`;
    })
    .join("<br/>");
}

const row = (label: string, value: string) =>
  `<tr><td style="padding:4px 12px 4px 0; color:#6a6a6a; vertical-align:top; white-space:nowrap;">${label}</td><td style="padding:4px 0; color:#2a2a2a;">${value}</td></tr>`;

function addressLine(a: any): string {
  if (!a || typeof a !== "object") return "";
  const place = [a.city, a.state].filter(Boolean).join(", ");
  return [a.address_line1, a.address_line2, place && a.pincode ? `${place} - ${a.pincode}` : place || a.pincode]
    .filter(Boolean)
    .map(escapeHtml)
    .join(", ");
}

export async function alertAdminsOfUnpaidCheckouts(
  supabase: Supabase,
  razorpayPayments: (rzpOrderId: string | null) => Promise<any[]>,
): Promise<number> {
  const now = Date.now();
  const quietSince = new Date(now - QUIET_MINUTES * 60_000).toISOString();
  const { data: released, error } = await supabase
    .from("orders")
    .select(
      "id, user_id, customer_name, customer_email, customer_phone, shipping_address, subtotal, shipping_cost, discount_amount, discount_code, total, razorpay_order_id, created_at",
    )
    .neq("payment_method", "cod")
    .not("payment_status", "in", "(paid,refunded)")
    .eq("order_status", "cancelled")
    .not("razorpay_order_id", "is", null)
    .is("unpaid_alert_sent_at", null)
    .gte("created_at", new Date(now - LOOKBACK_HOURS * 3_600_000).toISOString())
    .order("created_at");
  if (error) throw error;
  if (!released?.length) return 0;

  const byCustomer = new Map<string, typeof released>();
  for (const o of released) {
    const key = o.user_id ?? `email:${o.customer_email.toLowerCase()}`;
    byCustomer.set(key, [...(byCustomer.get(key) ?? []), o]);
  }

  let admins: string[] | null = null;
  let sent = 0;
  for (const tries of byCustomer.values()) {
    const first = tries[0];
    const last = tries[tries.length - 1];
    const mine = supabase
      .from("orders")
      .select("id, payment_method, payment_status, order_status, created_at")
      .gte("created_at", first.created_at);
    const { data: since, error: sinceError } = await (first.user_id
      ? mine.eq("user_id", first.user_id)
      : mine.eq("customer_email", first.customer_email));
    if (sinceError) throw sinceError;

    const boughtAfter = (since ?? []).some((o) => isPlaced(o));
    if (!boughtAfter) {
      // Still at it: a checkout still open, or a try in the last 30 minutes.
      const stillTrying = (since ?? []).some((o) => o.order_status !== "cancelled" || o.created_at > quietSince);
      if (stillTrying) continue;

      admins ??= await adminEmails(supabase);
      if (admins.length) {
        const html = await alertEmail(supabase, tries, razorpayPayments);
        const subject = `Checkout not paid - ${last.customer_name || last.customer_email} - ${money(last.total)} | AllBoutiqs`;
        await Promise.all(admins.map((to) => sendEmail(to, subject, html)));
        sent++;
      }
    }
    // Bought after all, or reported: never again for these tries.
    await supabase
      .from("orders")
      .update({ unpaid_alert_sent_at: new Date().toISOString() })
      .in("id", tries.map((o) => o.id));
  }
  return sent;
}

async function alertEmail(
  supabase: Supabase,
  tries: any[],
  razorpayPayments: (rzpOrderId: string | null) => Promise<any[]>,
): Promise<string> {
  const last = tries[tries.length - 1];
  const { data: items } = await supabase
    .from("order_items")
    .select("product_title, variant_title, quantity, price, vendor_id")
    .eq("order_id", last.id);
  const vendorIds = [...new Set((items ?? []).map((i) => i.vendor_id).filter(Boolean))];
  const { data: vendors } = vendorIds.length
    ? await supabase.from("vendors").select("id, name, boutique_code").in("id", vendorIds)
    : { data: [] as { id: string; name: string; boutique_code: string | null }[] };
  const boutique = new Map((vendors ?? []).map((v) => [v.id, v.boutique_code ? `${v.name} (${v.boutique_code})` : v.name]));

  const stories = await Promise.all(
    tries.map(async (o) => {
      const payments = await razorpayPayments(o.razorpay_order_id).catch(() => null);
      return payments ? paymentStory(payments) : "Couldn't ask Razorpay.";
    }),
  );

  const phone = String(last.customer_phone ?? "").trim();
  const customer = [
    row("Name", escapeHtml(last.customer_name)),
    row("Email", `<a href="mailto:${escapeHtml(last.customer_email)}" style="color:#7a2e22;">${escapeHtml(last.customer_email)}</a>`),
    phone ? row("Phone", `<a href="tel:${escapeHtml(phone)}" style="color:#7a2e22;">${escapeHtml(phone)}</a>`) : "",
    addressLine(last.shipping_address) ? row("Delivery to", addressLine(last.shipping_address)) : "",
  ].join("");

  const itemRows = (items ?? [])
    .map(
      (i) => `<tr>
        <td style="padding:6px 8px 6px 0; border-top:1px solid #eee; color:#2a2a2a;">${escapeHtml(i.product_title)}${
          i.variant_title && i.variant_title !== "Default" ? `<br/><span style="color:#6a6a6a; font-size:12px;">${escapeHtml(i.variant_title)}</span>` : ""
        }<br/><span style="color:#6a6a6a; font-size:12px;">${escapeHtml(boutique.get(i.vendor_id) ?? "")}</span></td>
        <td style="padding:6px 8px; border-top:1px solid #eee; text-align:center; color:#2a2a2a;">${i.quantity}</td>
        <td style="padding:6px 0 6px 8px; border-top:1px solid #eee; text-align:right; color:#2a2a2a; white-space:nowrap;">${money(i.price * i.quantity)}</td>
      </tr>`,
    )
    .join("");

  const totals = [
    row("Items", money(last.subtotal)),
    row("Delivery", Number(last.shipping_cost) > 0 ? money(last.shipping_cost) : "Free"),
    Number(last.discount_amount) > 0
      ? row(`Discount${last.discount_code ? ` (${escapeHtml(last.discount_code)})` : ""}`, `-${money(last.discount_amount)}`)
      : "",
    row("<strong>Total</strong>", `<strong>${money(last.total)}</strong>`),
  ].join("");

  const attempts =
    tries.length === 1
      ? row("Tried at", formatDateTime(last.created_at)) + row("Razorpay", stories[0])
      : tries.map((o, i) => row(`Try ${i + 1} - ${formatDateTime(o.created_at)}`, `${money(o.total)}<br/>${stories[i]}`)).join("");

  const name = escapeHtml(last.customer_name || last.customer_email);
  return emailTemplate({
    heading: "Checkout not paid",
    preheader: `${last.customer_name || last.customer_email} reached payment for ${money(last.total)} but didn't pay.`,
    bodyHtml: `
      <p style="color:#5a5a5a;"><strong>${name}</strong> got as far as paying ${money(last.total)} online${
        tries.length > 1 ? ` (${tries.length} tries)` : ""
      }, but no payment came through. The checkout was released and its stock put back - a call may still win the sale.</p>
      <h3 style="font-size:15px; margin:20px 0 6px; color:#2a2a2a;">Customer</h3>
      <table role="presentation" style="border-collapse:collapse; font-size:14px;">${customer}</table>
      <h3 style="font-size:15px; margin:20px 0 6px; color:#2a2a2a;">Payment</h3>
      <table role="presentation" style="border-collapse:collapse; font-size:14px;">${attempts}</table>
      <h3 style="font-size:15px; margin:20px 0 6px; color:#2a2a2a;">${tries.length > 1 ? "What was in the last try" : "What was in the checkout"}</h3>
      <table role="presentation" style="border-collapse:collapse; font-size:14px; width:100%;">
        <tr><th style="text-align:left; padding:0 8px 6px 0; color:#6a6a6a; font-weight:normal;">Product</th><th style="padding:0 8px 6px; color:#6a6a6a; font-weight:normal;">Qty</th><th style="text-align:right; padding:0 0 6px 8px; color:#6a6a6a; font-weight:normal;">Price</th></tr>
        ${itemRows}
      </table>
      <table role="presentation" style="border-collapse:collapse; font-size:14px; margin-top:10px; margin-left:auto;">${totals}</table>
    `,
    ctaLabel: "Open Payment not completed",
    ctaUrl: ADMIN_ORDERS_URL,
  });
}
