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
