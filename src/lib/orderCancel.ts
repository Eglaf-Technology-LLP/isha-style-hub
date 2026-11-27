// A customer can cancel only within 24 hours of placing the order (client,
// 13 Nov 2026). This only decides whether My Orders shows the Cancel button -
// cancel-order-items enforces the same window itself
// (supabase/functions/_shared/cancellation.ts, CUSTOMER_CANCEL_WINDOW_HOURS).
export const CUSTOMER_CANCEL_WINDOW_HOURS = 24;

export function customerCancelDeadline(orderPlacedAt: string): Date {
  return new Date(new Date(orderPlacedAt).getTime() + CUSTOMER_CANCEL_WINDOW_HOURS * 3_600_000);
}

export function isWithinCustomerCancelWindow(orderPlacedAt: string, now: number = Date.now()): boolean {
  return now <= customerCancelDeadline(orderPlacedAt).getTime();
}

// ...and only until the courier picks the part up (client, 27 Nov 2026):
// Cancel hides as soon as EITHER the 24 hours end OR the parcel is with the
// courier, whichever comes first. A part past these statuses is on its way
// (to our centre or to the customer); after delivery a problem goes through
// Report a problem, not a cancel. Same list as CUSTOMER_CANCELLABLE_STATUSES
// in supabase/functions/_shared/cancellation.ts.
export const CUSTOMER_CANCELLABLE_STATUSES = ["pending", "confirmed", "processing"];

// `inWarehouseParcel`: the warehouse already booked its parcel with this part.
export function isPartCancellableByCustomer(status: string, inWarehouseParcel = false): boolean {
  return CUSTOMER_CANCELLABLE_STATUSES.includes(status) && !inWarehouseParcel;
}

// What cancelling one boutique part refunds - the same sum cancel-order-items
// refunds (supabase/functions/_shared/cancellation.ts): its items and
// delivery charge, less their share of any coupon. There is no cancellation
// fee (24 Nov 2026: the client asked for 5%; the decision was no fee on a
// customer's cancel - only a Cash on Delivery bank-transfer refund carries
// the refund charge, and a cancelled COD order was never paid).
export function partCancelRefund(
  part: { subtotal?: number | null; shipping_cost?: number | null },
  items: { discount_amount?: number | null }[],
): number {
  const coupon = items.reduce((sum, i) => sum + Number(i.discount_amount ?? 0), 0);
  return Math.round((Number(part.subtotal ?? 0) + Number(part.shipping_cost ?? 0) - coupon) * 100) / 100;
}
