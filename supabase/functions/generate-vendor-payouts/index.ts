import { corsHeaders, jsonResponse, serviceClient, getCallerUserId, isAdmin, errorMessage } from "../_shared/auth.ts";

// Admin "Generate This Week's Payouts": batches every boutique order that is
// ready to pay into one pending payout per boutique - the same batching the
// payout-day job does (prepare_vendor_payouts). Ready means delivered, the
// return/exchange window closed, no return open, the online payment / COD
// cash in, and its payout date reached (vendor_order_payout_blocker). The
// batch is then sent with RazorpayX or paid by hand and marked credited.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getCallerUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    if (!(await isAdmin(supabase, userId))) return jsonResponse({ error: "Forbidden" }, 403);

    const { data, error } = await supabase.rpc("prepare_vendor_payouts", {});
    if (error) throw error;
    const rows = (data ?? []) as {
      vendor_id: string;
      vendor_name: string;
      payout_id: string | null;
      order_count: number;
      net_payable: number;
      skipped_reason: string | null;
    }[];

    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    return jsonResponse({
      period_start: today,
      period_end: today,
      created: rows
        .filter((r) => r.payout_id)
        .map((r) => ({ vendor_id: r.vendor_id, vendor_name: r.vendor_name, payout_id: r.payout_id, order_count: r.order_count, net_payable: Number(r.net_payable) })),
      skipped: rows
        .filter((r) => !r.payout_id)
        .map((r) => ({
          vendor_id: r.vendor_id,
          vendor_name: r.vendor_name,
          reason: `${r.skipped_reason} - ₹${Math.round(Number(r.net_payable))} from ${r.order_count} order(s) kept in queue`,
        })),
    });
  } catch (e) {
    console.error("generate-vendor-payouts error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
