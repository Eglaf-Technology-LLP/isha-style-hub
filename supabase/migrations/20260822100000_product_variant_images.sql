-- Optional per-variant image (e.g. a color's own photo) so the storefront
-- can show that specific variant's picture instead of the shared product
-- gallery when it's selected. Nullable - most variants won't set one and
-- fall back to the product's own images.
ALTER TABLE public.product_variants ADD COLUMN image_url TEXT;
