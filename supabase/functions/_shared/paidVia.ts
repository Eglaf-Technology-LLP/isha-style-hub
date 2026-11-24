// How the customer paid (client, 24 Nov 2026): "Paid by UPI / Card / Card
// EMI / Netbanking"; Cash on Delivery reads "Pay ₹X in cash when it
// arrives" - never "Your payment went through". orders.paid_via holds
// Razorpay's payment method. Same labels as src/lib/paymentMode.ts.

const PAID_VIA_LABEL: Record<string, string> = {
  upi: "UPI",
  card: "Card",
  emi: "Card EMI",
  netbanking: "Netbanking",
  cardless_emi: "Cardless EMI",
  paylater: "Pay Later",
  wallet: "mobile wallet",
};

// Razorpay's method for a payment entity (from its API or a webhook), as
// saved in orders.paid_via.
export function paidViaOf(payment: { method?: unknown } | null | undefined): string | null {
  const m = typeof payment?.method === "string" ? payment.method.trim().toLowerCase() : "";
  return m || null;
}

export function paidViaLabel(paidVia: string | null | undefined): string | null {
  if (!paidVia) return null;
  return PAID_VIA_LABEL[paidVia] ?? paidVia.replace(/_/g, " ");
}

interface PaymentModeOrder {
  payment_method: string;
  payment_status?: string | null;
  paid_via?: string | null;
}

// Short name for invoices and staff screens: "UPI", "Cash on Delivery",
// "AllBoutiqs wallet", "Online".
export function paymentModeName(o: PaymentModeOrder): string {
  if (o.payment_method === "cod") return "Cash on Delivery";
  if (o.payment_method === "wallet") return "AllBoutiqs wallet";
  return paidViaLabel(o.paid_via) ?? "Online";
}

// The customer's line. codAmount: what the courier collects - null when
// it isn't the whole order (a parcel, or part of it cancelled).
export function paymentModeLine(o: PaymentModeOrder, money: (n: number) => string, codAmount: number | null): string {
  if (o.payment_method === "cod") {
    if (o.payment_status === "paid") return "Paid in cash on delivery";
    return codAmount != null ? `Pay ${money(codAmount)} in cash when it arrives` : "Pay in cash when it arrives";
  }
  if (o.payment_method === "wallet") return "Paid from your AllBoutiqs wallet";
  const label = paidViaLabel(o.paid_via);
  return label ? `Paid by ${label}` : "Paid online";
}

// Until migration 20261124100000 is on a database, orders has no paid_via
// column: a write that includes it is retried without it, so marking an
// order paid never fails for it.
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703" || /paid_via/.test(error.message ?? "");
}

export async function withPaidVia<T extends { error: any }>(
  fields: Record<string, unknown>,
  paidVia: string | null,
  run: (fields: Record<string, unknown>) => PromiseLike<T>,
): Promise<T> {
  if (paidVia) {
    const res = await run({ ...fields, paid_via: paidVia });
    if (!isMissingColumn(res.error)) return res;
    console.error("orders.paid_via missing - saved without it", res.error);
  }
  return run(fields);
}
