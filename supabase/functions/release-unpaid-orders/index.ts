import { corsHeaders, errorMessage, getCallerUserId, isAdmin, jsonResponse, serviceClient } from "../_shared/auth.ts";
import { createHeldTransfers, rzp } from "../_shared/razorpayRoute.ts";
import { alertAdminsOfUnpaidCheckouts } from "./unpaidAlert.ts";

// Online checkouts whose payment never went through. Checkout saves the
// order (and takes the stock) before Razorpay opens; if the payment fails or
// the customer closes the window, this releases it - but only after asking
// Razorpay that no payment came through:
// - a captured payment -> the order is marked paid (as verify-razorpay-
//   payment would have done) and goes ahead;
// - a payment still in progress (e.g. a UPI request not yet approved) -> left
//   alone for now;
// - nothing -> abandon_checkout(): cancelled quietly, stock put back, coupon
//   use released.
// Called by the customer's checkout when they close the payment window (one
// order of theirs, straight away) and every 10 minutes by cron (all online
// checkouts left unpaid for 30 minutes). The cron run also emails the admins
// about customers who reached payment but didn't pay (unpaidAlert.ts).

const UNPAID_FOR_MINUTES = 30;

type Outcome = "paid" | "processing" | "released" | "skipped";

function isServiceRoleCall(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    return JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

async function razorpayPayments(rzpOrderId: string | null): Promise<any[]> {
  if (!rzpOrderId) return [];
  try {
    const res = await rzp("GET", `/v1/orders/${rzpOrderId}/payments`);
    return res?.items ?? [];
  } catch (e) {
    // An order Razorpay doesn't know (e.g. made with keys since replaced)
    // has no payment on this account.
    const description = (e as any)?.body?.error?.description ?? "";
    if (String(description).includes("does not exist")) return [];
    throw e;
  }
}

async function settle(supabase: ReturnType<typeof serviceClient>, order: any): Promise<Outcome> {
  if (order.payment_method === "cod" || ["paid", "refunded"].includes(order.payment_status)) return "skipped";
  const payments = await razorpayPayments(order.razorpay_order_id);

  const captured = payments.find((p) => p.status === "captured");
  if (captured) {
    await supabase
      .from("orders")
      .update({ payment_status: "paid", razorpay_payment_id: captured.id })
      .eq("id", order.id)
      .in("payment_status", ["pending", "failed"]);
    await supabase
      .from("payments")
      .update({
        payment_status: "paid",
        transaction_id: captured.id,
        gateway_fee: typeof captured.fee === "number" ? captured.fee / 100 : null,
        gateway_tax: typeof captured.tax === "number" ? captured.tax / 100 : null,
      })
      .eq("order_id", order.id)
      .in("payment_status", ["pending", "failed"]);
    await createHeldTransfers(supabase, order.id, captured.id).catch((e) =>
      console.error("release-unpaid-orders: createHeldTransfers", order.id, errorMessage(e)),
    );
    return "paid";
  }
  if (payments.some((p) => p.status === "authorized" || p.status === "created")) return "processing";

  const { data: released, error } = await supabase.rpc("abandon_checkout", { _order_id: order.id });
  if (error) throw error;
  return released ? "released" : "skipped";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = serviceClient();
    const body = await req.json().catch(() => ({}));
    const columns = "id, user_id, payment_method, payment_status, order_status, razorpay_order_id, created_at";

    // The customer (or an admin) closing the payment window: one order, now.
    if (!isServiceRoleCall(req)) {
      const userId = await getCallerUserId(req);
      if (!userId) return jsonResponse({ error: "Sign in first" }, 401);
      if (!body?.order_id) return jsonResponse({ error: "order_id is required" }, 400);
      const { data: order } = await supabase.from("orders").select(columns).eq("id", body.order_id).maybeSingle();
      if (!order || (order.user_id !== userId && !(await isAdmin(supabase, userId)))) {
        return jsonResponse({ error: "Order not found" }, 404);
      }
      if (order.order_status === "cancelled") return jsonResponse({ status: "released" });
      return jsonResponse({ status: await settle(supabase, order) });
    }

    // Cron: every online checkout left unpaid for 30 minutes.
    const before = new Date(Date.now() - UNPAID_FOR_MINUTES * 60_000).toISOString();
    const { data: orders, error } = await supabase
      .from("orders")
      .select(columns)
      .neq("payment_method", "cod")
      .in("payment_status", ["pending", "failed"])
      .neq("order_status", "cancelled")
      .lt("created_at", before)
      .order("created_at")
      .limit(100);
    if (error) throw error;

    const summary: Record<Outcome, number> & { alerts: number; errors: { order_id: string; error: string }[] } = {
      paid: 0,
      processing: 0,
      released: 0,
      skipped: 0,
      alerts: 0,
      errors: [],
    };
    for (const order of orders ?? []) {
      try {
        summary[await settle(supabase, order)]++;
      } catch (e) {
        console.error("release-unpaid-orders", order.id, errorMessage(e));
        summary.errors.push({ order_id: order.id, error: errorMessage(e) });
      }
    }
    try {
      summary.alerts = await alertAdminsOfUnpaidCheckouts(supabase, razorpayPayments);
    } catch (e) {
      console.error("release-unpaid-orders: unpaid checkout alert", errorMessage(e));
      summary.errors.push({ order_id: "alerts", error: errorMessage(e) });
    }
    return jsonResponse(summary);
  } catch (e) {
    console.error("release-unpaid-orders error", e);
    return jsonResponse({ error: errorMessage(e) }, 500);
  }
});
