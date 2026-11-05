-- RazorpayX payouts paused until the client's RazorpayX account is active and
-- its account number is set (user, 2026-10-16). With the rail on 'manual'
-- the daily payout-day job does nothing and bank accounts aren't registered
-- with RazorpayX; admins prepare payouts, pay by hand and "Mark credited".
-- The return/exchange-window rule (vendor_order_payout_blocker) still
-- applies to every payout. Turn back on: payout_rail = 'razorpayx'.
UPDATE public.platform_settings SET payout_rail = 'manual' WHERE id;
