-- Real payment collection via Razorpay. Route (marketplace split-at-
-- checkout) isn't enabled on this Razorpay account yet, so this is a
-- single payment to the platform per order; vendor_orders already tracks
-- what each vendor is owed (subtotal + shipping - commission) and that
-- stays exactly as-is as the payout ledger. Actual vendor settlement is a
-- separate later step once Route (or manual transfer) is available.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text;
