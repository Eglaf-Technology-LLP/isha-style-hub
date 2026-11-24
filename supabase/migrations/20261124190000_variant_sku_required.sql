-- Variant SKU required, and every SKU unique within a boutique across its
-- products AND their sizes/colours (user, 24 Nov 2026: "variant ka sku bhi
-- mandatory, duplicate nahi, per vendor unique, chahe wo variant ka hi kyu
-- na ho"). Follows 20261117110000_product_sku_required.sql, which made the
-- product SKU required and unique among the boutique's products only.
--
-- Case and surrounding spaces don't matter: "EX-01" and " ex-01" are the
-- same code. Different boutiques may use the same SKU.

-- ---------------------------------------------------------------------------
-- 1. One-off fill (user's choice, 24 Nov 2026). On that day live had 151 of
--    224 variants without a SKU, and one variant with its own product's SKU.
--    Such a variant gets <product SKU>-<SIZE>, plus -<COLOUR> when one size
--    comes in more than one colour (as the listing sheet import and the
--    boutiques' own codes do: KAP-136-XXL, 2334-XS-BLACK); spaces removed,
--    upper case; a code already taken gets -2, -3 ...
-- ---------------------------------------------------------------------------

UPDATE public.product_variants
SET sku = nullif(btrim(sku), '')
WHERE sku IS DISTINCT FROM nullif(btrim(sku), '');

-- A variant SKU that a product of the same boutique uses is given up.
UPDATE public.product_variants pv
SET sku = NULL
FROM public.products p
WHERE p.id = pv.product_id
  AND pv.sku IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.products p2
    WHERE p2.vendor_id IS NOT DISTINCT FROM p.vendor_id AND lower(p2.sku) = lower(pv.sku)
  );

-- Two variants of one boutique with the same SKU: the older keeps it.
WITH ranked AS (
  SELECT pv.id,
         row_number() OVER (PARTITION BY p.vendor_id, lower(pv.sku) ORDER BY pv.created_at, pv.id) AS rn
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.sku IS NOT NULL
)
UPDATE public.product_variants pv
SET sku = NULL
FROM ranked r
WHERE r.id = pv.id AND r.rn > 1;

DO $fill$
DECLARE
  r record;
  base text;
  code text;
  n integer;
BEGIN
  FOR r IN
    WITH v AS (
      SELECT pv.id, pv.product_id, pv.created_at, p.vendor_id, btrim(p.sku) AS product_sku,
             nullif(upper(regexp_replace(coalesce(pv.options->>'size', pv.options->>'Size', ''), '\s+', '', 'g')), '') AS size,
             nullif(upper(regexp_replace(coalesce(pv.options->>'color', pv.options->>'Color', pv.options->>'colour', pv.options->>'Colour', ''), '\s+', '', 'g')), '') AS colour,
             pv.sku
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
    )
    SELECT v.*,
           (SELECT count(DISTINCT v2.colour) FROM v v2 WHERE v2.product_id = v.product_id AND v2.size IS NOT DISTINCT FROM v.size) > 1
             AS size_in_many_colours
    FROM v
    WHERE v.sku IS NULL
    ORDER BY v.vendor_id, v.product_id, v.created_at, v.id
  LOOP
    base := r.product_sku
      || coalesce('-' || r.size, '')
      || CASE WHEN r.size IS NULL OR r.size_in_many_colours THEN coalesce('-' || r.colour, '') ELSE '' END;
    IF base = r.product_sku THEN
      base := r.product_sku || '-V';
    END IF;
    code := base;
    n := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.vendor_id IS NOT DISTINCT FROM r.vendor_id AND lower(p.sku) = lower(code)
    ) OR EXISTS (
      SELECT 1 FROM public.product_variants v
      JOIN public.products p ON p.id = v.product_id
      WHERE p.vendor_id IS NOT DISTINCT FROM r.vendor_id AND lower(v.sku) = lower(code)
    ) LOOP
      n := n + 1;
      code := base || '-' || n;
    END LOOP;
    UPDATE public.product_variants SET sku = code WHERE id = r.id;
  END LOOP;
END
$fill$;

-- ---------------------------------------------------------------------------
-- 2. The rule, for products and variants alike. SECURITY DEFINER so the check
--    sees every code of the boutique whatever the saver may read; an advisory
--    lock on (boutique, code) stops two saves at the same moment from both
--    passing.
-- ---------------------------------------------------------------------------

-- Who in the boutique already uses this code ("product "X"" / "a size or
-- colour of "X""), leaving out the row being saved; null when it's free.
CREATE OR REPLACE FUNCTION public.boutique_sku_owner(
  _vendor_id uuid,
  _sku text,
  _skip_product uuid,
  _skip_variant uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner FROM (
    SELECT 1 AS o, format('product "%s"', p.name) AS owner
    FROM public.products p
    WHERE p.vendor_id = _vendor_id AND lower(p.sku) = lower(_sku) AND p.id IS DISTINCT FROM _skip_product
    UNION ALL
    SELECT 2, format('a size or colour of "%s"', p.name)
    FROM public.product_variants v
    JOIN public.products p ON p.id = v.product_id
    WHERE p.vendor_id = _vendor_id AND lower(v.sku) = lower(_sku) AND v.id IS DISTINCT FROM _skip_variant
  ) x
  ORDER BY o
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.boutique_sku_owner(uuid, text, uuid, uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_product_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner text;
  v record;
BEGIN
  NEW.sku := nullif(btrim(coalesce(NEW.sku, '')), '');
  IF NEW.sku IS NULL THEN
    RAISE EXCEPTION 'SKU is required - the boutique''s own code for this product' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.vendor_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.vendor_id::text || ':' || lower(NEW.sku), 0));
  -- Its own sizes/colours count too: a variant can't share the product's SKU.
  v_owner := public.boutique_sku_owner(NEW.vendor_id, NEW.sku, NEW.id, NULL);
  IF v_owner IS NOT NULL THEN
    RAISE EXCEPTION 'SKU "%" is already used by % in this boutique - every product, size and colour needs its own SKU', NEW.sku, v_owner
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Moved to another boutique: its sizes/colours must be free there too.
  IF TG_OP = 'UPDATE' AND NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    FOR v IN SELECT id, sku FROM public.product_variants WHERE product_id = NEW.id AND sku IS NOT NULL LOOP
      IF lower(v.sku) = lower(NEW.sku) THEN
        v_owner := 'this product';
      ELSE
        v_owner := (
          SELECT owner FROM (
            SELECT 1 AS o, format('product "%s"', p.name) AS owner
            FROM public.products p
            WHERE p.vendor_id = NEW.vendor_id AND lower(p.sku) = lower(v.sku) AND p.id <> NEW.id
            UNION ALL
            SELECT 2, format('a size or colour of "%s"', p.name)
            FROM public.product_variants pv
            JOIN public.products p ON p.id = pv.product_id
            WHERE p.vendor_id = NEW.vendor_id AND lower(pv.sku) = lower(v.sku) AND pv.product_id <> NEW.id
          ) x ORDER BY o LIMIT 1
        );
      END IF;
      IF v_owner IS NOT NULL THEN
        RAISE EXCEPTION 'SKU "%" is already used by % in this boutique - every product, size and colour needs its own SKU', v.sku, v_owner
          USING ERRCODE = 'unique_violation';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Same trigger as before (20261117110000), now with the function above.
DROP TRIGGER IF EXISTS enforce_product_sku_trigger ON public.products;
CREATE TRIGGER enforce_product_sku_trigger
  BEFORE INSERT OR UPDATE OF sku, vendor_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_sku();

CREATE OR REPLACE FUNCTION public.enforce_variant_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor uuid;
  v_owner text;
BEGIN
  NEW.sku := nullif(btrim(coalesce(NEW.sku, '')), '');
  IF NEW.sku IS NULL THEN
    RAISE EXCEPTION 'SKU is required for every size and colour - the boutique''s own code for it' USING ERRCODE = 'check_violation';
  END IF;
  SELECT vendor_id INTO v_vendor FROM public.products WHERE id = NEW.product_id;
  IF v_vendor IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_vendor::text || ':' || lower(NEW.sku), 0));
  v_owner := public.boutique_sku_owner(v_vendor, NEW.sku, NULL, NEW.id);
  IF v_owner IS NOT NULL THEN
    RAISE EXCEPTION 'SKU "%" is already used by % in this boutique - every product, size and colour needs its own SKU', NEW.sku, v_owner
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_variant_sku_trigger ON public.product_variants;
CREATE TRIGGER enforce_variant_sku_trigger
  BEFORE INSERT OR UPDATE OF sku, product_id ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_variant_sku();

-- The hard guarantee that every variant has one (all filled in step 1).
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS product_variants_sku_required;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_sku_required CHECK (sku IS NOT NULL AND btrim(sku) <> '');
