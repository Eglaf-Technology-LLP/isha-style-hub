-- Nothing anywhere in this schema could mark a product non-refundable
-- (e.g. innerwear, opened cosmetics) - every product was implicitly fully
-- refundable, governed only by the vendor's flat return_window_days.
--
-- is_returnable governs refund eligibility only, not exchange - a
-- non-returnable item can still be exchanged for a different size/colour,
-- per confirmed decision. It's a per-product flag (not per-category), also
-- per confirmed decision.
ALTER TABLE public.products ADD COLUMN is_returnable boolean NOT NULL DEFAULT true;

-- Snapshotted onto order_items at checkout, same pattern already used for
-- product_title/size/color/price on this table (a live join to products
-- would let a vendor's later policy change retroactively affect an order
-- placed under the old policy - unfair to the customer and legally
-- questionable, same reasoning price is snapshotted rather than joined).
ALTER TABLE public.order_items ADD COLUMN is_returnable boolean NOT NULL DEFAULT true;
