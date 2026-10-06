import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, emailTemplate } from "../_shared/email.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Called only by the database (notify_vendor_order_delivered ->
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

const formatDate = (d: string) =>
  new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

serve(async (req) => {
  if (!isServiceRoleCall(req)) return json({ error: "Forbidden" }, 403);

  try {
    const { vendor_order_id } = await req.json();
    if (!vendor_order_id) return json({ error: "vendor_order_id is required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: vo, error: voErr } = await supabase
      .from("vendor_orders")
      .select("id, order_id, vendor_id, net_payable, payout_eligible_on")
      .eq("id", vendor_order_id)
      .maybeSingle();
    if (voErr) throw voErr;
    if (!vo?.payout_eligible_on) return json({ error: "Vendor order not delivered/scheduled" }, 404);

    const [{ data: vendor }, { data: account }, { data: holdDays }] = await Promise.all([
      supabase.from("vendors").select("name, contact_email, owner_user_id").eq("id", vo.vendor_id).maybeSingle(),
      supabase.from("vendor_payout_accounts").select("id").eq("vendor_id", vo.vendor_id).maybeSingle(),
      supabase.rpc("vendor_order_payout_hold_days", { _vendor_order_id: vo.id }),
    ]);
    if (!vendor) return json({ error: "Vendor not found" }, 404);

    let to = vendor.contact_email;
    if (!to && vendor.owner_user_id) {
      const { data } = await supabase.auth.admin.getUserById(vendor.owner_user_id);
      to = data.user?.email ?? null;
    }
    if (!to) return json({ sent: false, reason: "no email for vendor" });

    const ref = `#${String(vo.order_id).slice(0, 8)}`;
    const amount = `₹${Math.round(Number(vo.net_payable)).toLocaleString("en-IN")}`;
    const date = formatDate(vo.payout_eligible_on);
    const hold = Number(holdDays ?? 0);
    const why =
      hold > 0
        ? `This is after the ${hold}-day return window, so any return can be settled before you're paid.`
        : "Nothing in this order is returnable, so there's no return-window wait.";

    const html = account
      ? emailTemplate({
          heading: "Your order was delivered",
          preheader: `Payout of ${amount} scheduled for ${date}`,
          bodyHtml: `
            <p style="color:#5a5a5a;">Hi ${vendor.name}, order <strong>${ref}</strong> has been delivered to the customer.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f2; border-radius:8px; padding:16px; margin:16px 0; font-size:14px;">
              <tr><td style="padding:2px 0;"><strong>Payout amount:</strong> ${amount}</td></tr>
              <tr><td style="padding:2px 0;"><strong>Scheduled for:</strong> ${date}</td></tr>
            </table>
            <p style="color:#5a5a5a;">${why} The amount is after AllBoutiqs commission.</p>
          `,
          ctaLabel: "View payouts",
          ctaUrl: "https://allboutiqs.com/vendor?tab=payouts",
        })
      : emailTemplate({
          heading: "Add your payout account to get paid",
          preheader: `${amount} is due to you on ${date}`,
          bodyHtml: `
            <p style="color:#5a5a5a;">Hi ${vendor.name}, order <strong>${ref}</strong> has been delivered and <strong>${amount}</strong> is due to you on <strong>${date}</strong>.</p>
            <p style="color:#5a5a5a;">Your payout account isn't set up yet, so we can't send this money. Please add your bank account details in your dashboard.</p>
          `,
          ctaLabel: "Set up payout account",
          ctaUrl: "https://allboutiqs.com/vendor?tab=payouts",
        });

    const subject = account
      ? `Order ${ref} delivered - payout of ${amount} on ${date} | AllBoutiqs`
      : `Action needed: add your payout account to receive ${amount} | AllBoutiqs`;

    const result = await sendEmail(to, subject, html);
    return json({ sent: !result.skipped, to_domain: to.split("@")[1] });
  } catch (error: any) {
    console.error("send-vendor-payout-email error:", error);
    return json({ error: error.message }, 500);
  }
});
