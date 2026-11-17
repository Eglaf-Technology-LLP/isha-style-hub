-- Customisation charge as a % of the product price (client corrections,
-- 15 Nov 2026, points 3.3.3 and 2.5.1):
--   "Customisation charge = % of the product price (1, 2, 3, 4, 5, 7, 10, 15
--    or 20%) - not a ₹ amount. Customer sees "+₹X (10%) · Adds N extra days
--    · Total T days"."
--
-- products.customisation_pct replaces the ₹ custom size price and the ₹
-- extra options (both hidden or retired). The charge is that % of the
-- price of the piece the customer picked (its size / colour, GST included),
-- in whole rupees, and is added to the line's price - so GST, invoices, fees
-- and payouts include it, as before. It applies once a piece is customised:
-- made to the customer's measurements and/or with their note.
--
-- The server works it out (enforce_order_item_customisation), never the
-- browser. Order lines keep a snapshot with the % and the ₹ charge; older
-- lines keep their ₹ prices as they are.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS customisation_pct smallint;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_customisation_pct_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_customisation_pct_check
    CHECK (customisation_pct IS NULL OR customisation_pct IN (1, 2, 3, 4, 5, 7, 10, 15, 20));

COMMENT ON COLUMN public.products.customisation_pct IS
  'Customisation charge: % of the piece''s price (1, 2, 3, 4, 5, 7, 10, 15 or 20), in whole rupees. Required when customisable.';

-- Products offering customisation today: the % nearest their old ₹ custom
-- size price (on 17 Nov 2026, the 2 live products).
UPDATE public.products p
SET customisation_pct = (
  SELECT x FROM unnest(ARRAY[1, 2, 3, 4, 5, 7, 10, 15, 20]) AS x
  ORDER BY abs(x - coalesce(p.custom_size_price, 0) * 100 / nullif(p.price, 0)) NULLS LAST, x
  LIMIT 1)
WHERE p.customisable AND p.customisation_pct IS NULL;

-- ---------------------------------------------------------------------------
-- Product set-up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_product_customisation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF jsonb_array_length(NEW.customisation_options) > 20 THEN
    RAISE EXCEPTION 'A product can have up to 20 customisation options' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.customisable AND NEW.customisation_pct IS NULL THEN
    RAISE EXCEPTION 'Choose the customisation charge: 1, 2, 3, 4, 5, 7, 10, 15 or 20%% of the product price'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_product_customisation_trigger ON public.products;
CREATE TRIGGER validate_product_customisation_trigger
  BEFORE INSERT OR UPDATE OF customisable, customisation_options, custom_size_price, customisation_pct ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_customisation();

-- ---------------------------------------------------------------------------
-- Order lines
-- ---------------------------------------------------------------------------
-- Rebuilds the customer's choice from the product (whatever the browser
-- sent), prices it at the product's % of the piece's price, and marks the
-- line not returnable. Runs before price_order_item (name order), which
-- adds customisation_price to the piece's price.
CREATE OR REPLACE FUNCTION public.enforce_order_item_customisation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.products;
  c jsonb := NEW.customisation;
  v_size jsonb;
  v_meas jsonb := '{}'::jsonb;
  m record;
  v_note text;
  v_photo text;
  v_base numeric;
  v_charge numeric;
BEGIN
  IF c IS NULL OR jsonb_typeof(c) <> 'object' THEN
    NEW.customisation := NULL;
    NEW.customisation_price := 0;
    RETURN NEW;
  END IF;

  SELECT * INTO p FROM public.products WHERE id::text = NEW.product_id::text;
  IF NOT FOUND OR NOT p.customisable OR p.customisation_pct IS NULL THEN
    RAISE EXCEPTION '"%" can''t be customised any more - please remove the customisation and add it again.', NEW.product_title
      USING ERRCODE = 'check_violation';
  END IF;

  -- Priced extra options are retired: the charge is one % for the piece.
  IF jsonb_typeof(c->'options') = 'array' AND jsonb_array_length(c->'options') > 0 THEN
    RAISE EXCEPTION 'A customisation chosen for "%" is no longer offered - please choose again.', NEW.product_title
      USING ERRCODE = 'check_violation';
  END IF;

  -- Made to the customer's measurements.
  IF jsonb_typeof(c->'custom_size') = 'object' THEN
    FOR m IN SELECT key, btrim(value) AS value FROM jsonb_each_text(coalesce(c->'custom_size'->'measurements', '{}'::jsonb)) LOOP
      IF m.value <> '' THEN
        v_meas := v_meas || jsonb_build_object(left(m.key, 40), left(m.value, 20));
      END IF;
    END LOOP;
    IF v_meas = '{}'::jsonb THEN
      RAISE EXCEPTION 'Please enter your measurements for "%".', NEW.product_title USING ERRCODE = 'check_violation';
    END IF;
    v_size := jsonb_build_object('unit', 'in', 'measurements', v_meas);
  END IF;

  v_note := nullif(left(btrim(coalesce(c->>'note', '')), 1000), '');
  v_photo := nullif(btrim(coalesce(c->>'photo_path', '')), '');
  IF v_photo IS NOT NULL AND NOT public.is_privileged_writer() AND split_part(v_photo, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'That reference photo can''t be used.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_size IS NULL AND v_note IS NULL AND v_photo IS NULL THEN
    NEW.customisation := NULL;
    NEW.customisation_price := 0;
    RETURN NEW;
  END IF;

  -- The piece's price as price_order_item takes it: the chosen variant's,
  -- or for a line without one the dearest of the product's.
  IF NEW.variant_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT coalesce(pv.price, p.price) INTO v_base
    FROM public.product_variants pv
    WHERE pv.id = NEW.variant_id::uuid AND pv.product_id = p.id;
  END IF;
  IF v_base IS NULL THEN
    SELECT greatest(max(coalesce(pv.price, p.price)), p.price) INTO v_base
    FROM public.product_variants pv WHERE pv.product_id = p.id;
  END IF;
  v_charge := round(coalesce(v_base, p.price) * p.customisation_pct / 100);

  NEW.customisation := jsonb_build_object(
    'options', '[]'::jsonb, 'custom_size', v_size, 'note', v_note, 'photo_path', v_photo,
    'days', coalesce(p.customisation_days, 0), 'pct', p.customisation_pct, 'charge', v_charge);
  NEW.customisation_price := v_charge;
  -- Made to measure: no return or exchange.
  NEW.is_returnable := false;
  IF NEW.price < v_charge THEN
    RAISE EXCEPTION 'The price of "%" doesn''t include its customisation - please add it to your cart again.', NEW.product_title
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
