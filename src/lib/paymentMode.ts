import { formatMoney } from "@/lib/format";

// How the customer paid (client, 24 Nov 2026): "Paid by UPI / Card / Card
// EMI / Netbanking"; Cash on Delivery reads "Pay ₹X in cash when it
// arrives" - never "Your payment went through". orders.paid_via holds
// Razorpay's payment method (set when the payment is verified); older
// online orders without it read "Paid online". Same labels as
// supabase/functions/_shared/paidVia.ts.

const PAID_VIA_LABEL: Record<string, string> = {
  upi: "UPI",
  card: "Card",
  emi: "Card EMI",
  netbanking: "Netbanking",
  cardless_emi: "Cardless EMI",
  paylater: "Pay Later",
  wallet: "mobile wallet",
};

export interface PaymentModeOrder {
  payment_method: string;
  payment_status?: string | null;
  // Missing until migration 20261124100000 is on the database.
  paid_via?: string | null;
}

export function paidViaLabel(paidVia: string | null | undefined): string | null {
  if (!paidVia) return null;
  return PAID_VIA_LABEL[paidVia] ?? paidVia.replace(/_/g, " ");
}

// Short name for staff screens and invoices: "UPI", "Card EMI", "Cash on
// Delivery", "AllBoutiqs wallet", "Online".
export function paymentModeName(o: PaymentModeOrder): string {
  if (o.payment_method === "cod") return "Cash on Delivery";
  if (o.payment_method === "wallet") return "AllBoutiqs wallet";
  return paidViaLabel(o.paid_via) ?? "Online";
}

// The customer's line: "Paid by UPI", "Pay ₹5,000 in cash when it arrives",
// "Paid in cash on delivery", "Paid from your AllBoutiqs wallet".
// codAmount: what the courier collects - null when that isn't the order
// total (part of the order cancelled). format: the page's own money style.
export function paymentModeLine(
  o: PaymentModeOrder,
  codAmount: number | null,
  format: (n: number) => string = formatMoney,
): string {
  if (o.payment_method === "cod") {
    if (o.payment_status === "paid") return "Paid in cash on delivery";
    return codAmount != null ? `Pay ${format(codAmount)} in cash when it arrives` : "Pay in cash when it arrives";
  }
  if (o.payment_method === "wallet") return "Paid from your AllBoutiqs wallet";
  const label = paidViaLabel(o.paid_via);
  return label ? `Paid by ${label}` : "Paid online";
}

// An order's payment line on the customer's order pages, given its boutique
// parts: the cash amount only while nothing is cancelled (the courier then
// collects the order total); a cancelled Cash on Delivery order has
// nothing to pay.
export function orderPaymentLine(
  o: PaymentModeOrder & { total: number; order_status?: string | null },
  parts: { status: string }[],
  format: (n: number) => string = formatMoney,
): string {
  const cancelled = parts.filter((p) => p.status === "cancelled").length;
  if (o.payment_method === "cod" && o.payment_status !== "paid") {
    if (o.order_status === "cancelled" || (parts.length > 0 && cancelled === parts.length)) {
      return "Cash on Delivery - nothing to pay";
    }
  }
  return paymentModeLine(o, cancelled > 0 ? null : Number(o.total), format);
}
