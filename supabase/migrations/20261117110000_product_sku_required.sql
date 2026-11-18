-- SKU required and unique within a boutique (client corrections, 15 Nov
-- 2026, point 3.2.1: "SKU required (the boutique's own code)").
--
-- The product form and both imports already ask for it; this is the
-- backstop. Spaces around it are dropped, an empty one is refused, and two
-- products of the same boutique can't share a SKU (case doesn't matter:
-- "EX-01" and "ex-01" are the same code). Different boutiques may use the
-- same SKU. On 17 Nov 2026 every live product had a SKU and none repeated.

CREATE OR REPLACE FUNCTION public.enforce_product_sku()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.sku := nullif(btrim(coalesce(NEW.sku, '')), '');
  IF NEW.sku IS NULL THEN
    RAISE EXCEPTION 'SKU is required - the boutique''s own code for this product' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.vendor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.vendor_id = NEW.vendor_id AND lower(p.sku) = lower(NEW.sku) AND p.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'SKU "%" is already used by another product of this boutique - every product needs its own SKU', NEW.sku
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_product_sku_trigger ON public.products;
CREATE TRIGGER enforce_product_sku_trigger
  BEFORE INSERT OR UPDATE OF sku, vendor_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_sku();

-- The hard guarantee (two saves at the same moment).
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_required;
ALTER TABLE public.products
  ADD CONSTRAINT products_sku_required CHECK (sku IS NOT NULL AND btrim(sku) <> '');

CREATE UNIQUE INDEX IF NOT EXISTS products_vendor_sku_unique
  ON public.products (vendor_id, lower(sku))
  WHERE vendor_id IS NOT NULL;
