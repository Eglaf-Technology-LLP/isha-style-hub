// RazorpayX boutique payouts are built but paused (2026-10-16) until the
// client's RazorpayX account is activated and its account number is set.
// While off: no RazorpayX panel or "Send via RazorpayX" buttons for admins,
// no bank-account registration/₹1 check for boutiques; payouts are paid by
// hand and marked credited. The server side is paused with
// platform_settings.payout_rail = 'manual'. To turn it on: set this to true
// and payout_rail back to 'razorpayx' (and RAZORPAYX_ACCOUNT_NUMBER).
export const RAZORPAYX_PAYOUTS_ENABLED = false;

// Razorpay Route (each boutique's own linked account) is on hold too: the
// Route feature isn't enabled on the merchant account, and payouts are paid
// by hand with proof. While off, approving a boutique doesn't try to create
// its Route account (which only failed and told every admin "Razorpay Route
// isn't available"). The server skips it as well unless payout_rail =
// 'razorpay_route'. To turn it on: enable Route (and Direct Transfers) in the
// Razorpay dashboard, set payout_rail to 'razorpay_route' and this to true.
export const RAZORPAY_ROUTE_ENABLED = false;
