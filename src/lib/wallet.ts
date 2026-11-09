// The customer's AllBoutiqs wallet. Money only comes in from refunds the
// customer chose to take as wallet balance (a return that passed the
// quality check, a paid order cancelled) and is only spent on AllBoutiqs
// orders - no top-ups, no withdrawal to a bank, no transfers. The ledger is
// wallet_transactions; see the 20261102100000_customer_wallet migration.

// How a refund reaches the customer (return_requests.refund_method):
// wallet - straight away; original - back to the card/UPI the order was
// paid with; bank - Cash on Delivery, by bank transfer once the customer
// emails their bank details.
export type RefundMethod = "wallet" | "original" | "bank";

export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  wallet: "AllBoutiqs Wallet",
  original: "Original payment method",
  bank: "Bank transfer",
};

// What a Cash on Delivery customer emails us for a bank refund.
export const BANK_DETAILS_FIELDS = ["Account holder name", "Account number", "Bank name", "IFSC code"] as const;

// Working days, after the quality check, to transfer a bank refund.
export const BANK_REFUND_DAYS = 5;

// The refund choices an order offers: always the wallet, then the original
// online payment or (Cash on Delivery) a bank transfer. An order paid from
// the wallet goes back to the wallet only.
export function refundOptions(paymentMethod: string): RefundMethod[] {
  if (paymentMethod === "wallet") return ["wallet"];
  return paymentMethod === "cod" ? ["wallet", "bank"] : ["wallet", "original"];
}

export const WALLET_KIND_LABEL: Record<string, string> = {
  return_refund: "Refund for a return",
  cancellation_refund: "Refund for a cancelled order",
  order_payment: "Paid for an order",
  order_payment_released: "Payment not completed - returned",
  adjustment: "Adjustment by AllBoutiqs",
};

// Returns where the fault isn't the customer's: refunded in full, whichever
// way the money goes. Same list as supabase/functions/_shared/refundMethod.ts.
export const CHARGE_FREE_RETURN_REASONS = [
  "Defective or damaged product",
  "Wrong item received",
  "Product not as described",
  "Colour is different from what was shown",
];

// The refund charge on money sent back to the bank / original payment
// (platform_settings.refund_charge_pct, plus GST on it). The wallet is free.
export interface RefundCharge {
  pct: number;
  gstPct: number;
}

export const DEFAULT_REFUND_CHARGE: RefundCharge = { pct: 5, gstPct: 18 };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function refundChargeOn(gross: number, charge: RefundCharge | null): { fee: number; gst: number } {
  if (!charge || gross <= 0) return { fee: 0, gst: 0 };
  const fee = round2((gross * charge.pct) / 100);
  return { fee, gst: round2((fee * charge.gstPct) / 100) };
}

// "3% + 18% GST (3.54% in all)"
export const refundChargeLabel = (charge: RefundCharge) =>
  `${charge.pct}% + ${charge.gstPct}% GST (${round2(charge.pct * (1 + charge.gstPct / 100))}% in all)`;
