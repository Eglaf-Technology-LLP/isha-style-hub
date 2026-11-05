-- Per-product free-form specifications (Wash Care, Fabric, Package
-- Contains, etc. - varies product to product, not just category to
-- category) plus two fields the legal-metrology-style compliance block
-- on the product page needs that nothing existing covers.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS specifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS country_of_origin text NOT NULL DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS net_quantity text NOT NULL DEFAULT '1 N';
