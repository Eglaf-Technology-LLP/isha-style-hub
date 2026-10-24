-- Product Value (Developer Corrections Part 7, 5.1): what a boutique enters
-- is its Product Value EXCLUDING GST. The customer's price (MRP) = Product
-- Value + GST, GST taken on the Product Value at the category's HSN rate
-- (apparel: 5% up to the HSN price limit, the higher rate above it).
--
-- products.price / product_variants.price stay the customer's price, so the
-- storefront, bag, checkout, orders and invoices (which take GST back out
-- of the price with gst_rate_for) keep working unchanged. The new
-- product_value / compare_at_value columns hold what the boutique typed;
-- triggers keep the two in step whoever writes:
--   * a writer that sends product_value gets price worked out from it;
--   * an older writer that only sends price gets product_value worked back.
-- All 44 existing products' prices are taken as Product Values (the user's
-- decision), so their customer prices go up by GST.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_value numeric(12, 2),
  ADD COLUMN IF NOT EXISTS compare_at_value numeric(12, 2);
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS product_value numeric(12, 2);

COMMENT ON COLUMN public.products.product_value IS 'Product Value excl. GST, as the boutique entered it; price = this + GST';
COMMENT ON COLUMN public.products.compare_at_value IS 'Compare-at (pre-discount) value excl. GST; compare_at_price = this + GST';
COMMENT ON COLUMN public.product_variants.product_value IS 'Product Value excl. GST for this variant; price = this + GST';

-- GST % on a Product Value in a category (0 when the category has no HSN code).
-- SECURITY DEFINER: the triggers below run as whoever saves the product (a
-- boutique), and the rate must not depend on what that user may read.
CREATE OR REPLACE FUNCTION public.gst_rate_for_value(_category_id uuid, _value numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT CASE
      WHEN h.price_limit IS NULL OR _value <= h.price_limit THEN h.gst_rate
      ELSE coalesce(h.gst_rate_above_limit, h.gst_rate)
    END
    FROM public.categories c
    JOIN public.hsn_codes h ON h.id = c.hsn_code_id
    WHERE c.id = _category_id
  ), 0);
$$;

-- Customer price (MRP incl. GST) for a Product Value.
CREATE OR REPLACE FUNCTION public.price_with_gst(_category_id uuid, _value numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(_value * (1 + public.gst_rate_for_value(_category_id, _value) / 100), 2);
$$;

-- Product Value back from a customer price (for writers that still send a
-- price), using the same rate rule the invoice uses (gst_rate_for).
CREATE OR REPLACE FUNCTION public.value_from_price(_category_id uuid, _price numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(_price / (1 + coalesce((
    SELECT public.gst_rate_for(c.hsn_code_id, _price)
    FROM public.categories c
    WHERE c.id = _category_id AND c.hsn_code_id IS NOT NULL
  ), 0) / 100), 2);
$$;

GRANT EXECUTE ON FUNCTION public.gst_rate_for_value(uuid, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.price_with_gst(uuid, numeric) TO anon, authenticated;

-- ---------- existing data: today's prices are Product Values ----------
-- (filled before the triggers exist, so nothing is worked back)

UPDATE public.products SET product_value = price WHERE product_value IS NULL;
UPDATE public.products SET compare_at_value = compare_at_price WHERE compare_at_value IS NULL AND compare_at_price IS NOT NULL;
UPDATE public.product_variants SET product_value = price WHERE product_value IS NULL AND price IS NOT NULL;

-- ---------- keep price and Product Value in step ----------

CREATE OR REPLACE FUNCTION public.products_price_from_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_value IS NULL AND NEW.price IS NOT NULL THEN
      NEW.product_value := public.value_from_price(NEW.category_id, NEW.price);
    END IF;
    IF NEW.compare_at_value IS NULL AND NEW.compare_at_price IS NOT NULL THEN
      NEW.compare_at_value := public.value_from_price(NEW.category_id, NEW.compare_at_price);
    END IF;
  ELSE
    IF NEW.product_value IS NOT DISTINCT FROM OLD.product_value AND NEW.price IS DISTINCT FROM OLD.price THEN
      NEW.product_value := public.value_from_price(NEW.category_id, NEW.price);
    END IF;
    IF NEW.compare_at_value IS NOT DISTINCT FROM OLD.compare_at_value
       AND NEW.compare_at_price IS DISTINCT FROM OLD.compare_at_price THEN
      NEW.compare_at_value := CASE WHEN NEW.compare_at_price IS NULL THEN NULL
                                   ELSE public.value_from_price(NEW.category_id, NEW.compare_at_price) END;
    END IF;
  END IF;

  IF NEW.product_value IS NOT NULL THEN
    NEW.price := public.price_with_gst(NEW.category_id, NEW.product_value);
  END IF;
  NEW.compare_at_price := CASE WHEN NEW.compare_at_value IS NULL THEN NULL
                               ELSE public.price_with_gst(NEW.category_id, NEW.compare_at_value) END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_price_from_value ON public.products;
CREATE TRIGGER products_price_from_value
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_price_from_value();

CREATE OR REPLACE FUNCTION public.variants_price_from_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_category uuid;
BEGIN
  SELECT category_id INTO v_category FROM public.products WHERE id = NEW.product_id;
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_value IS NULL AND NEW.price IS NOT NULL THEN
      NEW.product_value := public.value_from_price(v_category, NEW.price);
    END IF;
  ELSIF NEW.product_value IS NOT DISTINCT FROM OLD.product_value AND NEW.price IS DISTINCT FROM OLD.price THEN
    NEW.product_value := CASE WHEN NEW.price IS NULL THEN NULL ELSE public.value_from_price(v_category, NEW.price) END;
  END IF;
  IF NEW.product_value IS NOT NULL THEN
    NEW.price := public.price_with_gst(v_category, NEW.product_value);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS variants_price_from_value ON public.product_variants;
CREATE TRIGGER variants_price_from_value
  BEFORE INSERT OR UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.variants_price_from_value();

-- A product moving to another category (another GST rate) re-prices its
-- variants too.
CREATE OR REPLACE FUNCTION public.reprice_variants_on_category_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.product_variants SET product_value = product_value WHERE product_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reprice_variants_on_category_change ON public.products;
CREATE TRIGGER reprice_variants_on_category_change
  AFTER UPDATE OF category_id ON public.products
  FOR EACH ROW WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id)
  EXECUTE FUNCTION public.reprice_variants_on_category_change();

-- Re-price everything once: price = Product Value + GST.
UPDATE public.products SET product_value = product_value;
UPDATE public.product_variants SET product_value = product_value;
