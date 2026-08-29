import { corsHeaders, jsonResponse, serviceClient, getCallerUserId, isAdmin, errorMessage } from "../_shared/auth.ts";

// Admin-triggered, not a cron - Razorpay Route isn't enabled on this
// account, so there's no automated payout rail; an admin reviews a period
// and does the actual bank transfer themselves outside the app. This just
// computes what's owed and records it, once per run.
//
// Eligibility: delivered, paid, and not already claimed by an earlier run
// (payout_id IS NULL) - that last check is the real safeguard against
// double-counting, not the date range, which is only a descriptive label.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    if (!(await isAdmin(supabase, userId))) return jsonResponse({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const periodEnd: Date = body.period_end ? new Date(body.period_end) : new Date();

    let periodStart: Date;
    if (body.period_start) {
      periodStart = new Date(body.period_start);
    } else {
      const { data: lastPayout, error: lastErr } = await supabase
        .from("vendor_payouts")
        .select("period_end")
        .order("period_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastErr) throw lastErr;
      periodStart = lastPayout
        ? new Date(lastPayout.period_end)
        : new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    if (periodStart >= periodEnd) {
      return jsonResponse({ error: "period_start must be before period_end" }, 400);
    }

    const periodStartStr = periodStart.toISOString().slice(0, 10);
    const periodEndStr = periodEnd.toISOString().slice(0, 10);

    const { data: vendors, error: vendorsErr } = await supabase.from("vendors").select("id, name");
    if (vendorsErr) throw vendorsErr;

    const created: { vendor_id: string; vendor_name: string; payout_id: string; order_count: number; net_payable: number }[] = [];
    const skipped: { vendor_id: string; vendor_name: string; reason: string }[] = [];

    for (const vendor of vendors ?? []) {
      const { data: existing, error: existingErr } = await supabase
        .from("vendor_payouts")
        .select("id")
        .eq("vendor_id", vendor.id)
        .eq("period_start", periodStartStr)
        .maybeSingle();
      if (existingErr) throw existingErr;
      if (existing) {
        skipped.push({ vendor_id: vendor.id, vendor_name: vendor.name, reason: "already generated for this period" });
        continue;
      }

      const { data: vendorOrders, error: voErr } = await supabase
        .from("vendor_orders")
        .select("id, subtotal, shipping_cost, commission_amount, net_payable, order:orders(payment_status)")
        .eq("vendor_id", vendor.id)
        .eq("status", "delivered")
        .is("payout_id", null);
      if (voErr) throw voErr;

      const eligible = (vendorOrders ?? []).filter((vo) => {
        const order = Array.isArray(vo.order) ? vo.order[0] : vo.order;
        return (order as { payment_status?: string } | null)?.payment_status === "paid";
      });

      if (eligible.length === 0) {
        skipped.push({ vendor_id: vendor.id, vendor_name: vendor.name, reason: "nothing eligible" });
        continue;
      }

      const grossSales = eligible.reduce((sum, vo) => sum + Number(vo.subtotal) + Number(vo.shipping_cost), 0);
      const commissionAmount = eligible.reduce((sum, vo) => sum + Number(vo.commission_amount), 0);
      const netPayable = eligible.reduce((sum, vo) => sum + Number(vo.net_payable), 0);

      const { data: payout, error: insertErr } = await supabase
        .from("vendor_payouts")
        .insert({
          vendor_id: vendor.id,
          period_start: periodStartStr,
          period_end: periodEndStr,
          gross_sales: grossSales,
          commission_amount: commissionAmount,
          net_payable: netPayable,
          status: "pending",
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      const { error: stampErr } = await supabase
        .from("vendor_orders")
        .update({ payout_id: payout.id })
        .in("id", eligible.map((vo) => vo.id));
      if (stampErr) throw stampErr;

      created.push({
        vendor_id: vendor.id,
        vendor_name: vendor.name,
        payout_id: payout.id,
        order_count: eligible.length,
        net_payable: netPayable,
      });
    }

    return jsonResponse({ period_start: periodStartStr, period_end: periodEndStr, created, skipped });
  } catch (e) {
    console.error("generate-vendor-payouts error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
