-- usePayments.ts wrote payment_status values ("completed", "partially_refunded")
-- that were never in this constraint at all - markPaymentComplete() and a
-- partial refund would both throw a DB error today. The admin's own revenue
-- stats separately checked for "completed" too, so they silently never
-- matched real data (which is always "paid"), making "Total Received"/
-- "Net Revenue" effectively broken - not just imprecise.
--
-- Standardizing on "paid" (already used everywhere else: orders.payment_status,
-- the Razorpay integration) instead of adding "completed" as a redundant
-- synonym, and adding "partially_refunded" for real since partial refunds
-- are genuine, already-attempted functionality.
-- Live proof of the bug this migration fixes: two real payments already
-- have payment_status = 'completed', written by markPaymentComplete()
-- via the admin's "Mark as Completed" button, sitting inconsistently
-- alongside their orders (which correctly show 'paid', since orders'
-- own constraint never allowed 'completed' in the first place).
UPDATE public.payments SET payment_status = 'paid' WHERE payment_status = 'completed';

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded'));

-- Razorpay's fee (inclusive of GST) charged per transaction - never captured
-- anywhere before, so there was no way to see the platform's true net take
-- after the payment gateway's own cut, only gross amounts.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gateway_fee numeric,
  ADD COLUMN IF NOT EXISTS gateway_tax numeric;
