-- Extra list from the client (C): when a customer gets as far as paying
-- online but no payment comes through, AllBoutiqs' admins get an email with
-- who it was and what they were buying, so they can follow up.
-- release-unpaid-orders sends it once the customer has been quiet for 30
-- minutes (a retry that goes through alerts nobody, and several tries in a
-- row come as one email); this column stamps each checkout it covered.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS unpaid_alert_sent_at timestamptz;

-- Checkouts released before this aren't reported.
UPDATE public.orders
SET unpaid_alert_sent_at = now()
WHERE NOT public.order_is_placed(payment_method, payment_status)
  AND order_status = 'cancelled'
  AND unpaid_alert_sent_at IS NULL;
