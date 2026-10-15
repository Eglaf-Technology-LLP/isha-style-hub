-- A boutique could only ever have one payout per period_start (left over
-- from the old period-based manual runs). With payout-day batches that
-- blocked real cases - a declined payout's orders going out again in a
-- later batch, or two batches whose earliest delivery falls on the same
-- day - and the money stayed stuck. Double payment is already prevented by
-- each order's link to its batch (vendor_orders.payout_id); what must stay
-- unique is one unsent batch per boutique per payout day.
ALTER TABLE public.vendor_payouts DROP CONSTRAINT IF EXISTS vendor_payouts_vendor_id_period_start_key;
CREATE UNIQUE INDEX IF NOT EXISTS vendor_payouts_one_pending_per_day
  ON public.vendor_payouts (vendor_id, payout_date) WHERE status = 'pending';
