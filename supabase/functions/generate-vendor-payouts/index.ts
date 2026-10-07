import { corsHeaders, jsonResponse, serviceClient, getCallerUserId, isAdmin, errorMessage } from "../_shared/auth.ts";

// Admin-triggered, not a cron - Razorpay Route isn't enabled on this
// account, so there's no automated payout rail; an admin reviews a period
// and does the actual bank transfer themselves outside the app. This just
// computes what's owed and records it, once per run.
//
// Eligibility: delivered, paid, not already claimed by an earlier run
// (payout_id IS NULL - the real safeguard against double-counting, not the
// date range, which is only a descriptive label), its scheduled payout date
// (payout_eligible_on: return window / Razorpay settlement, set on
// delivery) has arrived, and no return request on it is still open.
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
    // Payout dates are Indian calendar days.
    const todayIst = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

    // Vendor orders with a return still in progress wait until it's resolved.
    const { data: openReturns, error: openReturnsErr } = await supabase
      .from("return_requests")
      .select("items")
      .in("status", ["pending", "approved", "picked_up", "pickup_failed"]);
    if (openReturnsErr) throw openReturnsErr;
    const openReturnItemIds = (openReturns ?? []).flatMap((r) =>
      ((r.items as { order_item_id?: string }[]) ?? []).map((i) => i.order_item_id).filter(Boolean),
    ) as string[];
    const { data: openReturnItems } = openReturnItemIds.length
      ? await supabase.from("order_items").select("vendor_order_id").in("id", openReturnItemIds)
      : { data: [] as { vendor_order_id: string | null }[] };
    const vendorOrdersWithOpenReturns = new Set((openReturnItems ?? []).map((i) => i.vendor_order_id).filter(Boolean));

    const { data: vendors, error: vendorsErr } = await supabase.from("vendors").select("id, name, payout_account_status");
    if (vendorsErr) throw vendorsErr;
    const { data: accounts, error: accountsErr } = await supabase.from("vendor_payout_accounts").select("vendor_id");
    if (accountsErr) throw accountsErr;
    const vendorsWithAccount = new Set((accounts ?? []).map((a) => a.vendor_id));

    const created: { vendor_id: string; vendor_name: string; payout_id: string; order_count: number; net_payable: number }[] = [];
    const skipped: { vendor_id: string; vendor_name: string; reason: string }[] = [];

    for (const vendor of vendors ?? []) {
      const { data: existing, error: existingErr } = await supabase
        .from("vendor_payouts")
        .select("id")
        .eq("vendor_id", vendor.id)
        .eq("period_start", periodStartStr)
        // A declined payout's orders went back to the queue - don't let it
        // block paying them again in the same period.
        .neq("status", "failed")
        .maybeSingle();
      if (existingErr) throw existingErr;
      if (existing) {
        skipped.push({ vendor_id: vendor.id, vendor_name: vendor.name, reason: "already generated for this period" });
        continue;
      }

      const { data: vendorOrders, error: voErr } = await supabase
        .from("vendor_orders")
        .select("id, subtotal, shipping_cost, commission_amount, net_payable, payout_eligible_on, order:orders(payment_status)")
        .eq("vendor_id", vendor.id)
        .eq("status", "delivered")
        .is("payout_id", null)
        // Handled automatically by Razorpay Route - never pay these twice.
        .or("rzp_transfer_status.is.null,rzp_transfer_status.eq.failed");
      if (voErr) throw voErr;

      const paid = (vendorOrders ?? []).filter((vo) => {
        const order = Array.isArray(vo.order) ? vo.order[0] : vo.order;
        return (order as { payment_status?: string } | null)?.payment_status === "paid";
      });
      const onHold = paid.filter(
        (vo) => (vo.payout_eligible_on && vo.payout_eligible_on > todayIst) || vendorOrdersWithOpenReturns.has(vo.id),
      );
      const eligible = paid.filter((vo) => !onHold.includes(vo));

      // Ready money that can't be sent stays queued (the daily job keeps
      // reminding the boutique) rather than going into a run nobody can pay.
      const blocked = !vendorsWithAccount.has(vendor.id) || vendor.payout_account_status === "not_setup"
        ? "no payout bank account"
        : vendor.payout_account_status === "needs_update"
          ? "bank declined last transfer - waiting for updated bank details"
          : vendor.payout_account_status === "disabled"
            ? "payouts disabled"
            : null;
      if (blocked && eligible.length > 0) {
        const waiting = eligible.reduce((sum, vo) => sum + Number(vo.net_payable), 0);
        skipped.push({
          vendor_id: vendor.id,
          vendor_name: vendor.name,
          reason: `${blocked} - ₹${Math.round(waiting)} from ${eligible.length} order(s) kept in queue`,
        });
        continue;
      }

      if (eligible.length === 0) {
        const nextDate = onHold.map((vo) => vo.payout_eligible_on).filter(Boolean).sort()[0];
        skipped.push({
          vendor_id: vendor.id,
          vendor_name: vendor.name,
          reason: onHold.length
            ? `${onHold.length} delivered order(s) on hold (return window/open return)${nextDate ? ` - next due ${nextDate}` : ""}`
            : "nothing eligible",
        });
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
          order_count: eligible.length,
          vendor_order_ids: eligible.map((vo) => vo.id),
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
