-- GST by HSN code (customer tax invoice, step 2). Admins keep the HSN list;
-- each category points at one HSN code and its products take their GST rate
-- from it. Apparel and footwear have a price band: up to the limit per
-- piece/pair one rate (5%), above it another (18%) - fabrics, jewellery and
-- bags have one rate whatever the price (price_limit NULL).
--
-- Starter list prepared by us; AllBoutiqs will send the final one (admins
-- can edit rows or import an Excel). Rates as per the GST changes effective
-- 22 Sep 2025 - to be confirmed by the company's CA.

CREATE TABLE IF NOT EXISTS public.hsn_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9]{4,8}$'),
  description text NOT NULL,
  gst_rate numeric(5,2) NOT NULL CHECK (gst_rate >= 0 AND gst_rate <= 40),
  price_limit numeric(12,2) CHECK (price_limit > 0),
  gst_rate_above_limit numeric(5,2) CHECK (gst_rate_above_limit >= 0 AND gst_rate_above_limit <= 40),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((price_limit IS NULL) = (gst_rate_above_limit IS NULL))
);

ALTER TABLE public.hsn_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read HSN codes" ON public.hsn_codes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage HSN codes" ON public.hsn_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_hsn_codes_updated_at ON public.hsn_codes;
CREATE TRIGGER update_hsn_codes_updated_at BEFORE UPDATE ON public.hsn_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS hsn_code_id uuid REFERENCES public.hsn_codes(id) ON DELETE SET NULL;

-- GST rate for one unit sold at a GST-inclusive price. The band is decided
-- on the value before GST (price / (1 + lower rate)), the "sale value per
-- piece" the GST notification uses.
CREATE OR REPLACE FUNCTION public.gst_rate_for(_hsn_code_id uuid, _unit_price numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN h.price_limit IS NULL THEN h.gst_rate
    WHEN _unit_price / (1 + h.gst_rate / 100) <= h.price_limit THEN h.gst_rate
    ELSE h.gst_rate_above_limit
  END
  FROM public.hsn_codes h
  WHERE h.id = _hsn_code_id;
$$;

INSERT INTO public.hsn_codes (code, description, gst_rate, price_limit, gst_rate_above_limit) VALUES
  ('6206', 'Women''s blouses, shirts, kurtis, tops (woven)', 5, 2500, 18),
  ('6106', 'Women''s blouses, shirts, kurtis, tops (knitted)', 5, 2500, 18),
  ('6204', 'Women''s suits and sets, lehengas, gowns, dresses, skirts, trousers (woven)', 5, 2500, 18),
  ('6104', 'Women''s suits, dresses, skirts, trousers, leggings (knitted)', 5, 2500, 18),
  ('6109', 'T-shirts, singlets and vests (knitted)', 5, 2500, 18),
  ('6205', 'Men''s shirts and kurtas (woven)', 5, 2500, 18),
  ('6203', 'Men''s suits, sherwanis, jackets, blazers, trousers (woven)', 5, 2500, 18),
  ('6209', 'Babies'' garments (woven)', 5, 2500, 18),
  ('6111', 'Babies'' garments (knitted)', 5, 2500, 18),
  ('6208', 'Women''s nightwear, slips, petticoats (woven)', 5, 2500, 18),
  ('6108', 'Women''s nightwear and innerwear (knitted)', 5, 2500, 18),
  ('6212', 'Brassieres, corsets and similar', 5, 2500, 18),
  ('6214', 'Dupattas, stoles, shawls, scarves, veils', 5, 2500, 18),
  ('5007', 'Silk fabric - silk sarees, unstitched silk dress material', 5, NULL, NULL),
  ('5208', 'Cotton fabric - cotton sarees, unstitched cotton dress material', 5, NULL, NULL),
  ('5407', 'Synthetic fabric - georgette, chiffon and synthetic sarees, dress material', 5, NULL, NULL),
  ('6403', 'Footwear with leather uppers - juttis, mojaris (rate per pair)', 5, 2500, 18),
  ('6404', 'Footwear with textile uppers (rate per pair)', 5, 2500, 18),
  ('6402', 'Footwear with rubber or plastic uppers (rate per pair)', 5, 2500, 18),
  ('7117', 'Imitation / fashion jewellery', 3, NULL, NULL),
  ('7113', 'Gold and silver jewellery', 3, NULL, NULL),
  ('4202', 'Handbags, clutches, potli bags, wallets', 18, NULL, NULL)
ON CONFLICT (code) DO NOTHING;
