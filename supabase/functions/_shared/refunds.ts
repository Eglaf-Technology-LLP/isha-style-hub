import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { AppError, errorMessage } from "./auth.ts";
import { reverseVendorShare } from "./razorpayRoute.ts";
import { money } from "./money.ts";
import { RefundCharge, refundChargeOn } from "./refundMethod.ts";
export {
  CHARGE_FREE_RETURN_REASONS,
  refundChargeOn,
  returnRefundMethod,
  type RefundCharge,
  type RefundMethod,
} from "./refundMethod.ts";

// Thrown for anything wrong with the request itself (no payment, wrong
// status, amount exceeds what's left) - before executeRefund ever touches
// Razorpay. Callers map this to 400; anything else thrown (AppError from
// the gateway call, or a plain DB error) is a real failure worth a 5xx.
export class RefundValidationError extends Error {}

// Single source of truth for "how much of this payment is actually
// refunded" - both create-razorpay-refund (right after Razorpay responds)
// and razorpay-webhook (once Razorpay confirms async, possibly days later)
// call this so the two paths can never disagree about
// payments/orders.payment_status. Only status='processed' counts toward
// the total - a merely 'initiated'/'processing' refund hasn't actually
// moved money yet, so it doesn't get reflected as refunded.
export async function reconcileRefundTotals(supabase: SupabaseClient, paymentId: string): Promise<void> {
  const { data: payment, error: paymentErr } = await supabase
    .from("payments")
    .select("id, order_id, amount")
    .eq("id", paymentId)
    .single();
  if (paymentErr) throw paymentErr;

  const { data: processedRefunds, error: refundsErr } = await supabase
    .from("refunds")
    .select("amount")
    .eq("payment_id", paymentId)
    .eq("status", "processed");
  if (refundsErr) throw refundsErr;

  const processedSum = (processedRefunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const newPaymentStatus =
    processedSum >= payment.amount ? "refunded" : processedSum > 0 ? "partially_refunded" : "paid";

  const { error: updatePaymentErr } = await supabase
    .from("payments")
    .update({ refund_amount: processedSum, payment_status: newPaymentStatus })
    .eq("id", paymentId);
  if (updatePaymentErr) throw updatePaymentErr;

  // orders.payment_status has no 'partially_refunded' value in its check
  // constraint - only flip it once the whole payment is refunded, leave it
  // alone otherwise (matches the old DB-only processRefund()'s behavior
  // for the order-level flag).
  if (newPaymentStatus === "refunded") {
    const { error: updateOrderErr } = await supabase
      .from("orders")
      .update({ payment_status: "refunded" })
      .eq("id", payment.order_id);
    if (updateOrderErr) throw updateOrderErr;
  }
}

export interface ExecuteRefundParams {
  orderId: string;
  amount: number;
  reason: string;
  // null = system-initiated (no human triggered this specific call) -
  // cancel-vendor-order always passes the real caller, but the shape
  // stays nullable for any future non-human-initiated caller.
  initiatedBy: string | null;
  speed?: "instant" | "normal";
  returnRequestId?: string | null;
  // Which boutique order this refund is for, so its Razorpay payout share
  // can be reversed first. Derived from returnRequestId when not given.
  vendorOrderId?: string | null;
}

export interface ExecuteRefundResult {
  refundId: string;
  razorpayRefundId: string | null;
  status: "processing" | "processed";
}

// The actual "move money via Razorpay" primitive, extracted from
// create-razorpay-refund so cancel-vendor-order can call the same code
// instead of a second copy. Deliberately has NO authorization check of
// its own - each caller (create-razorpay-refund: admin-only;
// cancel-vendor-order: order-owner-or-admin) enforces its own boundary
// before calling this, and this function is never exposed directly over
// HTTP. Throws on any failure - callers translate to their own response.
export async function executeRefund(
  supabase: SupabaseClient,
  params: ExecuteRefundParams,
): Promise<ExecuteRefundResult> {
  const { orderId, amount, reason, initiatedBy, returnRequestId } = params;
  const refundSpeed = params.speed === "instant" ? "instant" : "normal";

  // One Razorpay payment covers a whole multi-vendor cart - there's no
  // per-vendor payments row to resolve here, this targets the order's
  // single payment record (verify-razorpay-payment writes it the same
  // way, by order_id, not payment_id).
  const { data: payment, error: paymentErr } = await supabase
    .from("payments")
    .select("id, order_id, amount, payment_status, transaction_id, refund_amount")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentErr) throw paymentErr;
  if (!payment) throw new RefundValidationError("No payment found for this order");
  if (!payment.transaction_id) {
    throw new RefundValidationError("This payment has no gateway transaction id - it may not have been paid via Razorpay");
  }
  if (payment.payment_status !== "paid" && payment.payment_status !== "partially_refunded") {
    throw new RefundValidationError(`Payment is '${payment.payment_status}' - only a paid or partially refunded payment can be refunded`);
  }

  // Committed = anything not yet known to have failed - covers a refund
  // still in flight (initiated/processing) as well as ones already
  // processed, so two refund attempts submitted back-to-back (e.g. a
  // return refund racing a cancellation on the same order) can't together
  // exceed what was actually paid.
  const { data: committedRefunds, error: refundsErr } = await supabase
    .from("refunds")
    .select("amount")
    .eq("payment_id", payment.id)
    .in("status", ["initiated", "processing", "processed"]);
  if (refundsErr) throw refundsErr;

  const alreadyCommitted = (committedRefunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const remaining = payment.amount - alreadyCommitted;
  if (amount > remaining) {
    throw new RefundValidationError(`Refund amount exceeds what's left refundable (${money(remaining)} remaining)`);
  }

  const { data: refundRow, error: insertErr } = await supabase
    .from("refunds")
    .insert({
      order_id: orderId,
      payment_id: payment.id,
      return_request_id: returnRequestId ?? null,
      initiated_by: initiatedBy,
      amount,
      reason,
      status: "initiated",
      razorpay_payment_id: payment.transaction_id,
      speed: refundSpeed,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  let vendorOrderId = params.vendorOrderId ?? null;
  if (!vendorOrderId && returnRequestId) {
    const { data: rr } = await supabase.from("return_requests").select("items").eq("id", returnRequestId).maybeSingle();
    const firstItemId = ((rr?.items as { order_item_id?: string }[]) ?? [])[0]?.order_item_id;
    if (firstItemId) {
      const { data: oi } = await supabase.from("order_items").select("vendor_order_id").eq("id", firstItemId).maybeSingle();
      vendorOrderId = oi?.vendor_order_id ?? null;
    }
  }
  if (vendorOrderId) await reverseVendorShare(supabase, vendorOrderId, amount);

  const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
  const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
  }
  const basicAuth = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

  let rzpBody: any;
  try {
    const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${payment.transaction_id}/refund`, {
      method: "POST",
      headers: { Authorization: basicAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        speed: refundSpeed,
        notes: { reason },
      }),
    });
    rzpBody = await rzpRes.json().catch(() => ({}));
    if (!rzpRes.ok) {
      console.error("Razorpay refund error", rzpRes.status, rzpBody);
      throw new AppError(rzpRes.status, "Razorpay refund failed", rzpBody);
    }
  } catch (e) {
    await supabase
      .from("refunds")
      .update({ status: "failed", failure_reason: errorMessage(e) })
      .eq("id", refundRow.id);
    throw e;
  }

  const newStatus: "processed" | "processing" = rzpBody.status === "processed" ? "processed" : "processing";
  const { error: updateErr } = await supabase
    .from("refunds")
    .update({
      razorpay_refund_id: rzpBody.id,
      status: newStatus,
      gateway_processed_at: newStatus === "processed" ? new Date().toISOString() : null,
    })
    .eq("id", refundRow.id);
  if (updateErr) throw updateErr;

  await reconcileRefundTotals(supabase, payment.id);

  return { refundId: refundRow.id, razorpayRefundId: rzpBody.id ?? null, status: newStatus };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// The admin's refund charge (Return settings).
export async function loadRefundCharge(supabase: SupabaseClient): Promise<RefundCharge> {
  const { data } = await supabase
    .from("platform_settings")
    .select("refund_charge_pct, refund_charge_gst_pct")
    .maybeSingle();
  return { pct: Number(data?.refund_charge_pct ?? 5), gstPct: Number(data?.refund_charge_gst_pct ?? 18) };
}

// What's left of the order's Razorpay payment itself - what executeRefund
// checks against, less refund charges already kept back from it.
async function gatewayRefundable(supabase: SupabaseClient, orderId: string): Promise<number> {
  const { data: payment, error } = await supabase
    .from("payments")
    .select("id, amount, payment_status, transaction_id")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!payment?.transaction_id || !["paid", "partially_refunded"].includes(payment.payment_status)) return 0;
  const { data: committed, error: refundsErr } = await supabase
    .from("refunds")
    .select("amount")
    .eq("payment_id", payment.id)
    .in("status", ["initiated", "processing", "processed"]);
  if (refundsErr) throw refundsErr;
  const [{ data: returnCharges }, { data: cancelCharges }] = await Promise.all([
    supabase.from("return_requests").select("refund_fee, refund_fee_gst").eq("order_id", orderId).eq("refund_method", "original"),
    supabase.from("order_cancellations").select("refund_fee, refund_fee_gst").eq("order_id", orderId).eq("refund_method", "original"),
  ]);
  const kept = [...(returnCharges ?? []), ...(cancelCharges ?? [])].reduce(
    (s, r) => s + Number(r.refund_fee) + Number(r.refund_fee_gst),
    0,
  );
  const refunded = (committed ?? []).reduce((s, r) => s + Number(r.amount), 0);
  return Math.max(0, round2(Number(payment.amount) - refunded - kept));
}

export interface RefundCustomerParams {
  orderId: string;
  amount: number;
  method: "wallet" | "original";
  kind: "return_refund" | "cancellation_refund";
  // Names this one refund (e.g. `cancel:<vendor order id>`) - a retry with
  // the same key never credits the wallet twice.
  sourceKey: string;
  reason: string;
  initiatedBy: string | null;
  returnRequestId?: string | null;
  vendorOrderId?: string | null;
  // The refund charge on the part going back to the original payment
  // (null: none - the wallet part is never charged).
  charge?: RefundCharge | null;
}

export interface RefundCustomerResult {
  walletAmount: number;
  // Sent to Razorpay - after the refund charge.
  gatewayAmount: number;
  // The refund charge kept back, and its GST. The caller records them on
  // the return / cancellation.
  fee: number;
  feeGst: number;
  // The Razorpay refund's `refunds` row, if part of it went that way.
  refundId: string | null;
}

// Refund the customer the way they chose. "original" goes back to the
// Razorpay payment as far as that payment covers it, less any refund
// charge; anything beyond was paid from the wallet, so it goes back to the
// wallet, free. The database caps wallet refunds at what the customer
// actually paid on the order.
export async function refundCustomer(
  supabase: SupabaseClient,
  params: RefundCustomerParams,
): Promise<RefundCustomerResult> {
  const amount = round2(params.amount);
  const { data: order, error } = await supabase
    .from("orders")
    .select("payment_method")
    .eq("id", params.orderId)
    .single();
  if (error) throw error;

  const gatewayGross =
    params.method === "original" && order.payment_method === "razorpay"
      ? Math.min(amount, await gatewayRefundable(supabase, params.orderId))
      : 0;
  const { fee, gst: feeGst } = refundChargeOn(gatewayGross, params.charge ?? null);
  const gatewayAmount = round2(gatewayGross - fee - feeGst);
  const walletAmount = round2(amount - gatewayGross);

  let refundId: string | null = null;
  if (gatewayAmount > 0) {
    const result = await executeRefund(supabase, {
      orderId: params.orderId,
      amount: gatewayAmount,
      reason: params.reason,
      initiatedBy: params.initiatedBy,
      returnRequestId: params.returnRequestId,
      vendorOrderId: params.vendorOrderId,
    });
    refundId = result.refundId;
  }
  // The boutique doesn't keep its share of the charge either - it's
  // AllBoutiqs' (executeRefund only reversed the share of what was refunded).
  if (fee + feeGst > 0 && params.vendorOrderId) {
    await reverseVendorShare(supabase, params.vendorOrderId, round2(fee + feeGst));
  }

  if (walletAmount > 0) {
    const { error: walletErr } = await supabase.rpc("wallet_refund", {
      _order_id: params.orderId,
      _amount: walletAmount,
      _kind: params.kind,
      _source_key: params.sourceKey,
      _return_request_id: params.returnRequestId ?? null,
      _vendor_order_id: params.vendorOrderId ?? null,
      _note: params.reason,
      _created_by: params.initiatedBy,
    });
    // P0001: the database refused it (over what's left, no customer) -
    // a problem with the request, not a server fault.
    if (walletErr) throw walletErr.code === "P0001" ? new RefundValidationError(walletErr.message) : walletErr;
    if (params.vendorOrderId) await reverseVendorShare(supabase, params.vendorOrderId, walletAmount);
  }

  return { walletAmount, gatewayAmount, fee, feeGst, refundId };
}
