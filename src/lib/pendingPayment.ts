// An online payment the customer has started but checkout hasn't heard the
// end of. On a phone the browser can reload the tab while the customer pays
// in their UPI app, and the payment result never reaches the page; checkout
// keeps this note so that after a reload it asks the server how the payment
// ended instead of showing the cart as if nothing happened (Extra list G).
// Same 30 minutes as an unpaid checkout is kept for.
const KEY = "allboutiqs-payment-in-progress";
const MAX_AGE_MS = 30 * 60_000;

export interface PendingPayment {
  orderId: string;
  userId: string;
  buyNow: boolean;
  startedAt: number;
}

export function savePendingPayment(p: PendingPayment) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage blocked (private mode): checkout still works, just without this.
  }
}

export function readPendingPayment(userId: string): PendingPayment | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as PendingPayment | null;
    if (!p) return null;
    if (p.userId !== userId || Date.now() - p.startedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function clearPendingPayment() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
