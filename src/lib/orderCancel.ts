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
