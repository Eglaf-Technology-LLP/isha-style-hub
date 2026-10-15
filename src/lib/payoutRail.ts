// RazorpayX boutique payouts are built but paused (2026-10-16) until the
// client's RazorpayX account is activated and its account number is set.
// While off: no RazorpayX panel or "Send via RazorpayX" buttons for admins,
// no bank-account registration/₹1 check for boutiques; payouts are paid by
// hand and marked credited. The server side is paused with
// platform_settings.payout_rail = 'manual'. To turn it on: set this to true
// and payout_rail back to 'razorpayx' (and RAZORPAYX_ACCOUNT_NUMBER).
export const RAZORPAYX_PAYOUTS_ENABLED = false;
