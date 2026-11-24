-- "When a size sells out" on Ready to Ship products (client corrections
-- FINAL v3, 15 Nov 2026: 3.2 point 4, 1.8 point 4 and the Part 4 list;
-- rules decided with the client on 20 Nov 2026).
--
-- A Ready to Ship product chooses what happens when a size runs out:
--   NULL             the size shows as sold out (as before)
--   'hide'           the size is left off the product page
--   'made_to_order'  the size can still be ordered and the boutique makes
--                    it: an extra charge (a fixed ₹ amount or a % of the
--                    piece's price, GST included, like the customisation
--                    charge) and extra days on top of its dispatch days.
-- A made-to-order line takes no stock and can't be paid by Cash on
-- Delivery. Returns follow the product's Returnable switch and the 24-hour
-- rule, and the customer can cancel in the first 24 hours, as for any
-- order. A boutique missing the date changes nothing automatically.
--
-- Made to Order listings have no stock at all: their order lines are marked
-- made_to_order too, and checkout no longer takes stock for them (until now
-- they couldn't be ordered once their stock was 0).

-- ---------------------------------------------------------------------------
-- 1. Product set-up
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sold_out_action text
    CHECK (sold_out_action IN ('made_to_order', 'hide')),
  -- One of the two (or neither = no extra charge).
  ADD COLUMN IF NOT EXISTS sold_out_extra_amount numeric(10,2)
    CHECK (sold_out_extra_amount >= 0 AND sold_out_extra_amount <= 50000),
  ADD COLUMN IF NOT EXISTS sold_out_extra_pct numeric(5,2)
    CHECK (sold_out_extra_pct IN (1, 2, 3, 4, 5, 7, 10, 15, 20)),
  -- Added to the product's dispatch days (prep_days).
  ADD COLUMN IF NOT EXISTS sold_out_extra_days integer
    CHECK (sold_out_extra_days BETWEEN 1 AND 90);

COMMENT ON COLUMN public.products.sold_out_action IS
  'Ready to Ship only. NULL = a sold-out size shows as sold out; hide = left off the page; made_to_order = still orderable, made by the boutique.';

CREATE OR REPLACE FUNCTION public.validate_product_sold_out()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only Ready to Ship pieces have stock to run out of.
  IF NEW.made_to_order THEN
    NEW.sold_out_action := NULL;
  END IF;
  IF NEW.sold_out_action IS DISTINCT FROM 'made_to_order' THEN
    NEW.sold_out_extra_amount := NULL;
    NEW.sold_out_extra_pct := NULL;
    NEW.sold_out_extra_days := NULL;
    RETURN NEW;
  END IF;
  IF NEW.sold_out_extra_days IS NULL THEN
    RAISE EXCEPTION 'Choose how many extra days it takes to make a sold-out size' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.sold_out_extra_amount IS NOT NULL AND NEW.sold_out_extra_pct IS NOT NULL THEN
    RAISE EXCEPTION 'Choose either an extra ₹ amount or an extra %% for a sold-out size, not both' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_product_sold_out_trigger ON public.products;
CREATE TRIGGER validate_product_sold_out_trigger
  BEFORE INSERT OR UPDATE OF made_to_order, sold_out_action, sold_out_extra_amount, sold_out_extra_pct, sold_out_extra_days
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_sold_out();

-- ---------------------------------------------------------------------------
-- 2. Order lines
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_items
  -- Made after the order (a Made to Order listing, or a sold-out size taken
  -- as made to order): no stock was taken for it.
  ADD COLUMN IF NOT EXISTS made_to_order boolean NOT NULL DEFAULT false,
  -- A sold-out size taken as made to order: {amount, pct, extra, days} as
  -- the product had them. A browser sends any object to ask for it.
  ADD COLUMN IF NOT EXISTS sold_out_terms jsonb,
  -- Per unit, already included in price.
  ADD COLUMN IF NOT EXISTS sold_out_extra numeric(10,2) NOT NULL DEFAULT 0;

-- Decides, for a browser's line, whether it comes from stock or is made to
-- order, and prices and times a made-to-order one. Fires after every other
-- BEFORE INSERT trigger on order_items (triggers run in name order:
-- enforce_cod_availability, enforce_order_item_customisation,
-- price_order_item, snapshot_order_item_prep_days, then this), so the
-- line's price and dispatch days are already set.
--
-- The browser says which it expects (sold_out_terms present or not); when
-- the stock has moved since, the order is refused with what changed, so
-- the customer never pays a price or waits days they didn't see.
CREATE OR REPLACE FUNCTION public.order_item_sold_out_made_to_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.products;
  v_asked boolean := NEW.sold_out_terms IS NOT NULL;
  v_variant uuid;
  v_stock integer;
  v_base numeric;
  v_extra numeric;
  v_method text;
  v_what text;
BEGIN
  SELECT * INTO p FROM public.products WHERE id::text = NEW.product_id::text;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- A Made to Order listing: always made after the order, never from stock.
  IF p.made_to_order THEN
    NEW.made_to_order := true;
    NEW.sold_out_terms := NULL;
    NEW.sold_out_extra := 0;
    RETURN NEW;
  END IF;

  -- Server functions and the SQL editor keep what they wrote.
  IF coalesce(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  NEW.made_to_order := false;
  NEW.sold_out_terms := NULL;
  NEW.sold_out_extra := 0;

  -- The stock checkout will take from (adjust_stock): the variant's, or the
  -- product's own for a line without a real variant.
  IF NEW.variant_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT pv.id, pv.stock INTO v_variant, v_stock
    FROM public.product_variants pv
    WHERE pv.id = NEW.variant_id::uuid AND pv.product_id = p.id;
  END IF;
  IF v_variant IS NULL THEN
    v_stock := p.stock_quantity;
  END IF;

  v_what := format('"%s"', NEW.product_title)
    || CASE WHEN nullif(btrim(NEW.size), '') IS NOT NULL THEN ' in size ' || btrim(NEW.size) ELSE '' END;

  IF coalesce(v_stock, 0) >= coalesce(NEW.quantity, 1) THEN
    IF v_asked THEN
      RAISE EXCEPTION '% is back in stock, so it no longer needs to be made to order - please check your cart and place the order again.', v_what
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Not enough stock and not made to order: refused when checkout takes the
  -- stock (adjust_stock), as before.
  IF p.sold_out_action IS DISTINCT FROM 'made_to_order' THEN
    RETURN NEW;
  END IF;
  IF NOT v_asked THEN
    RAISE EXCEPTION '% has just sold out. The boutique can still make it for you - please check your cart and place the order again.', v_what
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT payment_method INTO v_method FROM public.orders WHERE id = NEW.order_id;
  IF v_method = 'cod' THEN
    RAISE EXCEPTION 'Cash on Delivery isn''t available for made-to-order pieces (%). Please pay online.', v_what
      USING ERRCODE = 'check_violation';
  END IF;

  -- The piece's own price, as price_order_item set it (less any
  -- customisation charge on top).
  v_base := NEW.price - coalesce(NEW.customisation_price, 0);
  v_extra := CASE
    WHEN p.sold_out_extra_pct IS NOT NULL THEN round(v_base * p.sold_out_extra_pct / 100)
    ELSE coalesce(p.sold_out_extra_amount, 0)
  END;

  NEW.made_to_order := true;
  NEW.sold_out_extra := v_extra;
  NEW.sold_out_terms := jsonb_build_object(
    'amount', p.sold_out_extra_amount,
    'pct', p.sold_out_extra_pct,
    'extra', v_extra,
    'days', p.sold_out_extra_days);
  NEW.price := round(NEW.price + v_extra, 2);
  -- Dispatch days (snapshot_order_item_prep_days) + the extra days: the
  -- boutique's ready-by date and the late reminders follow from this.
  NEW.prep_days := least(180, coalesce(NEW.prep_days, 0) + coalesce(p.sold_out_extra_days, 0));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sold_out_made_to_order_trigger ON public.order_items;
CREATE TRIGGER sold_out_made_to_order_trigger
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_item_sold_out_made_to_order();
