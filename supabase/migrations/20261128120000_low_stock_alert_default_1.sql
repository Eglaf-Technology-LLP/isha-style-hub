-- Low-stock alerts (client, 28 Nov 2026): boutiques keep 1-5 pieces, so the
-- threshold of 10 made almost every size "Low stock" (69 alerts). Now one
-- threshold per product, used for each of its sizes: 1 by default, set on
-- the product form or in Inventory. Made to Order listings are left out of
-- stock alerts by the app (src/hooks/useLowStockAlerts.ts).

ALTER TABLE public.products ALTER COLUMN low_stock_threshold SET DEFAULT 1;

-- 10 was the old default. Only this column changes: products_price_from_value
-- works the MRP out again on any update, set_product_video_status tidies the
-- video fields, and update_products_updated_at moves updated_at - none of
-- that belongs to this change, so they're off for this one statement.
ALTER TABLE public.products DISABLE TRIGGER products_price_from_value;
ALTER TABLE public.products DISABLE TRIGGER set_product_video_status_trigger;
ALTER TABLE public.products DISABLE TRIGGER update_products_updated_at;

UPDATE public.products SET low_stock_threshold = 1 WHERE low_stock_threshold = 10;

ALTER TABLE public.products ENABLE TRIGGER products_price_from_value;
ALTER TABLE public.products ENABLE TRIGGER set_product_video_status_trigger;
ALTER TABLE public.products ENABLE TRIGGER update_products_updated_at;

COMMENT ON COLUMN public.products.low_stock_threshold IS
  'Low-stock alert: a size (or the product, without sizes) with this many pieces or fewer is "Low stock". 1 by default; not used for Made to Order listings';
COMMENT ON COLUMN public.product_variants.low_stock_threshold IS
  'Not used since 28 Nov 2026: every size follows its product''s low_stock_threshold';
