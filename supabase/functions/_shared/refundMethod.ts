// How the customer is refunded (return_requests.refund_method):
//   wallet   - into their AllBoutiqs wallet, straight away
//   original - back to the card/UPI the order was paid with (Razorpay)
//   bank     - Cash on Delivery: they email their bank details and the team
//              transfers it by hand, so nothing here moves money for it
export type RefundMethod = "wallet" | "original" | "bank";

// A return's method, for rows from before the customer chose one too.
export function returnRefundMethod(
  rr: { refund_method?: string | null },
  order: { payment_method: string },
): RefundMethod {
  if (order.payment_method === "wallet") return "wallet";
  if (rr.refund_method === "wallet" || rr.refund_method === "original" || rr.refund_method === "bank") {
    return rr.refund_method;
  }
  return order.payment_method === "cod" ? "bank" : "original";
}

// Returns where the fault isn't the customer's: refunded in full, whichever
// way the money goes. Same list as src/lib/wallet.ts.
export const CHARGE_FREE_RETURN_REASONS = [
  "Defective or damaged product",
  "Wrong item received",
  "Product not as described",
  "Colour is different from what was shown",
];

// The refund charge (platform_settings.refund_charge_pct, plus GST on it):
// only on a Cash on Delivery order's refund by bank transfer (client, 10 Nov
// 2026). The wallet and the original online payment get the full amount.
export interface RefundCharge {
  pct: number;
  gstPct: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function refundChargeOn(gross: number, charge: RefundCharge | null): { fee: number; gst: number } {
  if (!charge || gross <= 0) return { fee: 0, gst: 0 };
  const fee = round2((gross * charge.pct) / 100);
  return { fee, gst: round2((fee * charge.gstPct) / 100) };
}
