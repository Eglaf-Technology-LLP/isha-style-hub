-- How the customer paid an online order (client, 24 Nov 2026: "Paid by UPI /
-- Card / Card EMI / Netbanking" everywhere the order is shown). Razorpay's own
-- payment method: upi, card, emi (card EMI), netbanking, wallet (Paytm and
-- the like), cardless_emi, paylater. Set when the payment is verified
-- (verify-razorpay-payment, razorpay-webhook, release-unpaid-orders). Null
-- for Cash on Delivery and AllBoutiqs-wallet orders, and for online orders
-- whose method isn't known (shown as "Paid online").
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_via text;

COMMENT ON COLUMN public.orders.paid_via IS
  'Razorpay payment method of an online order: upi, card, emi, netbanking, wallet, cardless_emi, paylater. Null for COD / AllBoutiqs wallet / unknown.';

-- Orders paid before this column: from the payment.captured events the
-- Razorpay webhook already logged.
UPDATE public.orders o
SET paid_via = e.method
FROM (
  SELECT DISTINCT ON (razorpay_entity_id)
    razorpay_entity_id AS payment_id,
    lower(raw_payload #>> '{payload,payment,entity,method}') AS method
  FROM public.payment_events
  WHERE event_type = 'payment.captured'
    AND raw_payload #>> '{payload,payment,entity,method}' IS NOT NULL
  ORDER BY razorpay_entity_id, received_at DESC
) e
WHERE o.paid_via IS NULL
  AND o.razorpay_payment_id IS NOT NULL
  AND o.razorpay_payment_id = e.payment_id;
