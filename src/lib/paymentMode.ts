import { formatINR } from './format';

// How the customer paid - the website's src/lib/paymentMode.ts (client, 24
// Nov 2026): "Paid by UPI / Card / Card EMI / Netbanking"; Cash on Delivery
// reads "Pay ₹X in cash when it arrives" - never "Your payment went
// through". orders.paid_via holds Razorpay's payment method (migration
// 20261124100000, set when the payment is verified); older online orders
// without it read "Paid online". Same labels as
// supabase/functions/_shared/paidVia.ts.

const PAID_VIA_LABEL: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  emi: 'Card EMI',
  netbanking: 'Netbanking',
  cardless_emi: 'Cardless EMI',
  paylater: 'Pay Later',
  wallet: 'mobile wallet',
};

export interface PaymentModeOrder {
  payment_method: string;
  payment_status?: string | null;
  paid_via?: string | null;
}

export function paidViaLabel(
  paidVia: string | null | undefined,
): string | null {
  if (!paidVia) return null;
  return PAID_VIA_LABEL[paidVia] ?? paidVia.replace(/_/g, ' ');
}

// The customer's line: "Paid by UPI", "Pay ₹5,000 in cash when it arrives",
// "Paid in cash on delivery", "Paid from your AllBoutiqs wallet".
// codAmount: what the courier collects - null when that isn't the order
// total (part of the order cancelled).
export function paymentModeLine(
  o: PaymentModeOrder,
  codAmount: number | null,
  format: (n: number) => string = formatINR,
): string {
  if (o.payment_method === 'cod') {
    if (o.payment_status === 'paid') return 'Paid in cash on delivery';
    return codAmount != null
      ? `Pay ${format(codAmount)} in cash when it arrives`
      : 'Pay in cash when it arrives';
  }
  if (o.payment_method === 'wallet') return 'Paid from your AllBoutiqs wallet';
  const label = paidViaLabel(o.paid_via);
  return label ? `Paid by ${label}` : 'Paid online';
}

// An order's payment line on My orders, given its boutique parts: the cash
// amount only while nothing is cancelled (the courier then collects the
// order total); a cancelled Cash on Delivery order has nothing to pay.
export function orderPaymentLine(
  o: PaymentModeOrder & { total: number; order_status?: string | null },
  parts: { status: string }[],
  format: (n: number) => string = formatINR,
): string {
  const cancelled = parts.filter(p => p.status === 'cancelled').length;
  if (o.payment_method === 'cod' && o.payment_status !== 'paid') {
    if (
      o.order_status === 'cancelled' ||
      (parts.length > 0 && cancelled === parts.length)
    ) {
      return 'Cash on Delivery - nothing to pay';
    }
  }
  return paymentModeLine(o, cancelled > 0 ? null : Number(o.total), format);
}

// The payment pill on My orders (the website's paymentStatusDisplay in
// OrderHistory.tsx). A cancelled order doesn't read "Payment: Pending" (COD
// that will never be collected) or "Paid" (a refund is under way);
// otherwise it says how the order was paid - "Paid by UPI", or "Cash on
// Delivery" until the courier collects the cash.
export function paymentPill(
  o: PaymentModeOrder & { payment_status: string; order_status: string },
): { text: string; tone: 'done' | 'progress' | 'stopped' } {
  if (o.order_status === 'cancelled' && o.payment_status !== 'refunded') {
    if (o.payment_method === 'cod')
      return { text: 'Payment: Not Required', tone: 'stopped' };
    if (o.payment_status === 'paid')
      return { text: 'Payment: Refund Processing', tone: 'progress' };
  }
  if (o.payment_method === 'cod' && o.payment_status === 'pending')
    return { text: 'Cash on Delivery', tone: 'progress' };
  if (o.payment_status === 'paid')
    return { text: paymentModeLine(o, null), tone: 'done' };
  return {
    text: `Payment: ${
      o.payment_status.charAt(0).toUpperCase() + o.payment_status.slice(1)
    }`,
    tone: 'stopped',
  };
}
