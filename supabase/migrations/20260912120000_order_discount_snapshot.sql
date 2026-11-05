-- Once an order was placed, which coupon (if any) was used and how much it
-- saved was completely lost - orders only ever stored subtotal/shipping/total,
-- never the discount itself. The only trace was discounts.used_count, a bare
-- global counter with no link back to which order used it. User's real
-- complaint: apply a coupon, place the order, and there's no record of it
-- anywhere afterward - not in order history, not on the invoice.
--
-- Snapshotted here rather than joined live later, matching every other
-- "what actually happened at checkout" fact in this schema (order_items'
-- product_title/price/sku, invoices' seller/billing details) - a coupon
-- being edited or deleted after the fact must never change what a past
-- order shows it used.
ALTER TABLE public.orders
  ADD COLUMN discount_code text,
  ADD COLUMN discount_amount numeric NOT NULL DEFAULT 0;

-- Applied at the whole-order level (one cart, one coupon), not per vendor -
-- shown on every vendor's invoice for that order as an order-level fact,
-- not prorated into this vendor's own line items. Prorating would imply a
-- specific vendor-funds-the-discount accounting policy that hasn't been
-- decided; showing the real order-level number avoids asserting one.
ALTER TABLE public.invoices
  ADD COLUMN discount_code text,
  ADD COLUMN discount_amount numeric NOT NULL DEFAULT 0;
