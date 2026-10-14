-- Customisation: a product can be made to the customer's own measurements
-- and/or with extra options, each with its own price added to the product's.
-- The boutique sets it up per product (admins can change it on any product):
--   customisable            on/off
--   custom_size_price       price for making it to the customer's measurements
--                           (NULL = not offered; 0 = free)
--   customisation_options   [{id, label, price}] e.g. "Sleeve length change" +200
--   customisation_days      extra making days for a customised piece
-- The customer picks options, enters measurements, a note and a reference
-- photo. The order line keeps a snapshot (order_items.customisation) priced
-- by the server from the product - never by the browser - and its extra
-- price (customisation_price) is included in order_items.price, so totals,
-- GST, fees, invoices and payouts all include it. A customised piece is
-- made to measure: it can't be returned or exchanged.

-- ---------------------------------------------------------------------------
-- Product set-up
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS customisable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customisation_options jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(customisation_options) = 'array'),
  ADD COLUMN IF NOT EXISTS custom_size_price numeric(10,2) CHECK (custom_size_price >= 0),
  ADD COLUMN IF NOT EXISTS customisation_days integer CHECK (customisation_days BETWEEN 0 AND 60);

CREATE OR REPLACE FUNCTION public.validate_product_customisation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  o jsonb;
BEGIN
  IF jsonb_array_length(NEW.customisation_options) > 20 THEN
    RAISE EXCEPTION 'A product can have up to 20 customisation options' USING ERRCODE = 'check_violation';
  END IF;
  FOR o IN SELECT e FROM jsonb_array_elements(NEW.customisation_options) e LOOP
    IF coalesce(btrim(o->>'id'), '') = '' OR coalesce(btrim(o->>'label'), '') = '' THEN
      RAISE EXCEPTION 'Every customisation option needs a name' USING ERRCODE = 'check_violation';
    END IF;
    IF length(o->>'label') > 80 THEN
      RAISE EXCEPTION 'Customisation option names can be up to 80 characters' USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_typeof(o->'price') <> 'number' OR (o->>'price')::numeric < 0 OR (o->>'price')::numeric > 100000 THEN
      RAISE EXCEPTION 'The price of "%" must be between ₹0 and ₹1,00,000', o->>'label' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF NEW.customisable AND jsonb_array_length(NEW.customisation_options) = 0 AND NEW.custom_size_price IS NULL THEN
    RAISE EXCEPTION 'To offer customisation, add a custom size price or at least one option' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_product_customisation_trigger ON public.products;
CREATE TRIGGER validate_product_customisation_trigger
  BEFORE INSERT OR UPDATE OF customisable, customisation_options, custom_size_price ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_customisation();

-- ---------------------------------------------------------------------------
-- Order lines
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_items
  -- {options:[{id,label,price}], custom_size:{price,unit,measurements}|null,
  --  note, photo_path, days}
  ADD COLUMN IF NOT EXISTS customisation jsonb,
  -- Per unit, already included in price.
  ADD COLUMN IF NOT EXISTS customisation_price numeric(10,2) NOT NULL DEFAULT 0;

-- Rebuilds the customer's choice from the product's own options and prices
-- (whatever the browser sent), and marks the line not returnable.
CREATE OR REPLACE FUNCTION public.enforce_order_item_customisation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.products;
  c jsonb := NEW.customisation;
  o jsonb;
  po jsonb;
  v_opts jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_size jsonb;
  v_meas jsonb := '{}'::jsonb;
  m record;
  v_note text;
  v_photo text;
BEGIN
  IF c IS NULL OR jsonb_typeof(c) <> 'object' THEN
    NEW.customisation := NULL;
    NEW.customisation_price := 0;
    RETURN NEW;
  END IF;

  SELECT * INTO p FROM public.products WHERE id::text = NEW.product_id::text;
  IF NOT FOUND OR NOT p.customisable THEN
    RAISE EXCEPTION '"%" can''t be customised any more - please remove the customisation and add it again.', NEW.product_title
      USING ERRCODE = 'check_violation';
  END IF;

  -- Options, at the product's prices.
  FOR o IN SELECT DISTINCT ON (e->>'id') e FROM jsonb_array_elements(coalesce(c->'options', '[]'::jsonb)) e LOOP
    SELECT e INTO po FROM jsonb_array_elements(p.customisation_options) e WHERE e->>'id' = o->>'id';
    IF po IS NULL THEN
      RAISE EXCEPTION 'A customisation chosen for "%" is no longer offered - please choose again.', NEW.product_title
        USING ERRCODE = 'check_violation';
    END IF;
    v_opts := v_opts || jsonb_build_array(jsonb_build_object('id', po->>'id', 'label', po->>'label', 'price', (po->>'price')::numeric));
    v_total := v_total + (po->>'price')::numeric;
  END LOOP;

  -- Made to the customer's measurements.
  IF jsonb_typeof(c->'custom_size') = 'object' THEN
    IF p.custom_size_price IS NULL THEN
      RAISE EXCEPTION 'Custom size isn''t offered for "%".', NEW.product_title USING ERRCODE = 'check_violation';
    END IF;
    FOR m IN SELECT key, btrim(value) AS value FROM jsonb_each_text(coalesce(c->'custom_size'->'measurements', '{}'::jsonb)) LOOP
      IF m.value <> '' THEN
        v_meas := v_meas || jsonb_build_object(left(m.key, 40), left(m.value, 20));
      END IF;
    END LOOP;
    IF v_meas = '{}'::jsonb THEN
      RAISE EXCEPTION 'Please enter your measurements for "%".', NEW.product_title USING ERRCODE = 'check_violation';
    END IF;
    v_size := jsonb_build_object('price', p.custom_size_price, 'unit', 'in', 'measurements', v_meas);
    v_total := v_total + p.custom_size_price;
  END IF;

  v_note := nullif(left(btrim(coalesce(c->>'note', '')), 1000), '');
  v_photo := nullif(btrim(coalesce(c->>'photo_path', '')), '');
  IF v_photo IS NOT NULL AND NOT public.is_privileged_writer() AND split_part(v_photo, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'That reference photo can''t be used.' USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_array_length(v_opts) = 0 AND v_size IS NULL AND v_note IS NULL AND v_photo IS NULL THEN
    NEW.customisation := NULL;
    NEW.customisation_price := 0;
    RETURN NEW;
  END IF;

  NEW.customisation := jsonb_build_object(
    'options', v_opts, 'custom_size', v_size, 'note', v_note, 'photo_path', v_photo,
    'days', coalesce(p.customisation_days, 0));
  NEW.customisation_price := v_total;
  -- Made to measure: no return or exchange.
  NEW.is_returnable := false;
  IF NEW.price < v_total THEN
    RAISE EXCEPTION 'The price of "%" doesn''t include its customisation - please add it to your cart again.', NEW.product_title
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_order_item_customisation_trigger ON public.order_items;
CREATE TRIGGER enforce_order_item_customisation_trigger
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_customisation();

-- Making time: the product's preparation days plus, for a customised
-- piece, its customisation days. (Runs after the trigger above -
-- triggers fire in name order.)
CREATE OR REPLACE FUNCTION public.snapshot_order_item_prep_days()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT coalesce(p.prep_days, v.default_prep_days, ps.default_prep_days, 2)
  INTO NEW.prep_days
  FROM public.platform_settings ps
  LEFT JOIN public.products p ON p.id::text = NEW.product_id::text
  LEFT JOIN public.vendors v ON v.id = coalesce(NEW.vendor_id, p.vendor_id)
  WHERE ps.id;
  IF NEW.customisation IS NOT NULL THEN
    NEW.prep_days := least(90, coalesce(NEW.prep_days, 0) + coalesce((NEW.customisation->>'days')::integer, 0));
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Returns: customised pieces can't be returned or exchanged
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_return_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR coalesce(auth.role(), 'postgres') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT oi.product_title, oi.customisation IS NOT NULL AS customised, vo.id AS vendor_order_id, vo.status, vo.return_window_ends_on
    FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) AS e
    JOIN public.order_items oi ON oi.id::text = e->>'order_item_id'
    LEFT JOIN public.vendor_orders vo ON vo.id = oi.vendor_order_id
  LOOP
    IF r.customised THEN
      RAISE EXCEPTION '"%" was customised for you, so it can''t be returned or exchanged.', r.product_title
        USING ERRCODE = 'check_violation';
    END IF;
    -- Items not sold by a boutique have no delivery tracking to check.
    CONTINUE WHEN r.vendor_order_id IS NULL;
    IF r.status IS DISTINCT FROM 'delivered' THEN
      RAISE EXCEPTION '"%" hasn''t been delivered yet, so it can''t be returned or exchanged.', r.product_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF r.return_window_ends_on IS NOT NULL AND v_today > r.return_window_ends_on THEN
      RAISE EXCEPTION 'The return window for "%" closed on %.', r.product_title, to_char(r.return_window_ends_on, 'DD Mon YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Reference photos (private): the customer uploads to their own folder;
-- the boutique (and warehouse) of an order line that uses it, and admins,
-- can view it.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('customisation-photos', 'customisation-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

CREATE OR REPLACE FUNCTION public.can_view_customisation_photo(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.customisation->>'photo_path' = _path
      AND public.order_id_is_placed(oi.order_id)
      AND (public.is_vendor_member(auth.uid(), oi.vendor_id) OR public.can_operate_warehouse(auth.uid()))
  );
$$;

DROP POLICY IF EXISTS "Customers upload their own customisation photos" ON storage.objects;
CREATE POLICY "Customers upload their own customisation photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customisation-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Customers remove their own customisation photos" ON storage.objects;
CREATE POLICY "Customers remove their own customisation photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'customisation-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Customisation photos readable by customer, boutique, warehouse and admins" ON storage.objects;
CREATE POLICY "Customisation photos readable by customer, boutique, warehouse and admins"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'customisation-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR public.can_view_customisation_photo(name)
    )
  );
