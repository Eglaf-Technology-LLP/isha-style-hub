-- Order amounts are the server's, not the browser's (go-live audit, blocker 1).
--
-- Until now checkout sent every amount itself - each item's price, the
-- coupon, shipping, the COD charge, the order total and the Razorpay amount -
-- and nothing checked them. A tampered request could place a Rs 10,000 order
-- and pay Rs 1 online, or have the courier collect Rs 1 on Cash on Delivery.
-- Now, for anything a browser saves:
--
-- 1. Each item is priced from its product / variant (plus the customisation
--    charge enforce_order_item_customisation already works out), and takes
--    its boutique from the product. Only live, approved products of approved
--    boutiques can be ordered.
-- 2. Once the items are in, price_order works out the order: subtotal,
--    coupon (checked again and split over the lines it covers, as checkout
--    does), shipping per boutique, COD charge and total - and each boutique's
--    part with them.
-- 3. The COD charge must be one shiprocket-cod-charge quoted for this parcel
--    (cod_charge_quotes) - Shiprocket's rate can't be worked out in SQL.
-- 4. The payment row takes the order's amount; the Razorpay order is created
--    by create-razorpay-order from the saved order, which also stores its id
--    (a browser can no longer set razorpay_order_id).
-- 5. Nothing can be added to an order once its payment has started.
--
-- Server functions and the SQL editor (service role) are not affected.

-- ---------------------------------------------------------------------------
-- 1. COD charge quotes
-- ---------------------------------------------------------------------------

-- Written by shiprocket-cod-charge (service role) for every quote it gives;
-- read only by price_order. items_key = "<product id>:<quantity>,..." for the
-- boutique items, quantities summed per product, sorted by product id.
CREATE TABLE IF NOT EXISTS public.cod_charge_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_pincode text NOT NULL,
  order_value numeric(12,2) NOT NULL,
  items_key text NOT NULL,
  cod_charge numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cod_charge_quotes_lookup_idx
  ON public.cod_charge_quotes (delivery_pincode, items_key, created_at DESC);
ALTER TABLE public.cod_charge_quotes ENABLE ROW LEVEL SECURITY;

SELECT cron.schedule(
  'purge-cod-charge-quotes',
  '20 2 * * *',
  $$DELETE FROM public.cod_charge_quotes WHERE created_at < now() - interval '1 day'$$
);

-- ---------------------------------------------------------------------------
-- 2. New orders, payments and boutique parts from a browser
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_new_order_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.payment_status := 'pending';
    NEW.order_status := 'pending';
    NEW.wallet_amount := 0;
    NEW.razorpay_payment_id := NULL;
  END IF;
  -- Amounts come from the items (price_order); the Razorpay order from
  -- create-razorpay-order. The COD charge is checked against its quote.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    NEW.razorpay_order_id := NULL;
    NEW.subtotal := 0;
    NEW.discount_amount := 0;
    NEW.shipping_cost := 0;
    NEW.total := 0;
    NEW.cod_charge := CASE WHEN NEW.payment_method = 'cod' THEN greatest(coalesce(NEW.cod_charge, 0), 0) ELSE 0 END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_new_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.payment_status := 'pending';
    NEW.transaction_id := NULL;
    NEW.refund_amount := 0;
  END IF;
  -- What's charged is the order's own amount (apply_wallet_to_order takes
  -- the wallet's part off afterwards).
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
    NEW.amount := round(coalesce(o.total, 0) - coalesce(o.wallet_amount, 0), 2);
    NEW.payment_method := coalesce(o.payment_method, NEW.payment_method);
  END IF;
  RETURN NEW;
END;
$$;

-- A boutique's part of a new order: added before the items (checkout's
-- order), its amounts filled in by price_order, nothing about delivery or
-- payout set by the browser.
CREATE OR REPLACE FUNCTION public.guard_new_vendor_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_items WHERE order_id = NEW.order_id)
     OR EXISTS (SELECT 1 FROM public.payments WHERE order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'This order can''t be changed any more' USING ERRCODE = 'check_violation';
  END IF;
  NEW.status := 'pending';
  NEW.subtotal := 0;
  NEW.shipping_cost := 0;
  NEW.delivered_at := NULL;
  NEW.cod_received_at := NULL;
  NEW.payout_id := NULL;
  NEW.payout_eligible_on := NULL;
  NEW.rzp_transfer_id := NULL;
  NEW.rzp_transfer_status := NULL;
  NEW.rzp_transfer_amount := NULL;
  NEW.rzp_released_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_new_vendor_order_trigger ON public.vendor_orders;
CREATE TRIGGER guard_new_vendor_order_trigger
  BEFORE INSERT ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_vendor_order();

-- ---------------------------------------------------------------------------
-- 3. Each item at its product's price
-- ---------------------------------------------------------------------------

-- Fires after enforce_order_item_customisation (triggers run in name order),
-- so the customisation charge is already worked out.
CREATE OR REPLACE FUNCTION public.price_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  p public.products;
  v_variant_price numeric;
  v_vendor_order uuid;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND OR o.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'check_violation';
  END IF;
  IF o.order_status <> 'pending' OR o.payment_status <> 'pending' OR o.created_at < now() - interval '30 minutes'
     OR o.razorpay_order_id IS NOT NULL OR o.wallet_amount > 0
     OR EXISTS (SELECT 1 FROM public.payments WHERE order_id = o.id) THEN
    RAISE EXCEPTION 'Items can''t be added to this order any more' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO p FROM public.products WHERE id::text = NEW.product_id;
  IF NOT FOUND OR NOT p.is_active OR p.approval_status <> 'approved'
     OR NOT EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = p.vendor_id AND v.status = 'approved') THEN
    RAISE EXCEPTION '"%" is no longer available - please remove it from your cart.', NEW.product_title
      USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(NEW.quantity, 0) < 1 THEN
    RAISE EXCEPTION 'Please choose a quantity for "%".', NEW.product_title USING ERRCODE = 'check_violation';
  END IF;

  -- A real variant of this product at its own price (if it has one). A line
  -- with no real variant ("<product id>-default...") is at the product's
  -- price - or, if the product does have variants, its dearest one, so a
  -- line can never come out cheaper than the piece it stands for.
  IF NEW.variant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT pv.price INTO v_variant_price
    FROM public.product_variants pv
    WHERE pv.id = NEW.variant_id::uuid AND pv.product_id = p.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The size or colour chosen for "%" is no longer available - please choose again.', NEW.product_title
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT max(coalesce(pv.price, p.price)) INTO v_variant_price
    FROM public.product_variants pv WHERE pv.product_id = p.id;
    v_variant_price := greatest(v_variant_price, p.price);
  END IF;

  NEW.price := round(coalesce(v_variant_price, p.price) + coalesce(NEW.customisation_price, 0), 2);
  NEW.discount_amount := 0;
  NEW.is_returnable := coalesce(p.is_returnable, true) AND coalesce(NEW.is_returnable, true);
  NEW.vendor_id := p.vendor_id;

  SELECT vo.id INTO v_vendor_order
  FROM public.vendor_orders vo
  WHERE vo.order_id = o.id AND vo.vendor_id = p.vendor_id
  ORDER BY (vo.id = NEW.vendor_order_id) DESC
  LIMIT 1;
  IF v_vendor_order IS NULL THEN
    RAISE EXCEPTION 'Something went wrong saving your order - please try again.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.vendor_order_id := v_vendor_order;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS price_order_item_trigger ON public.order_items;
CREATE TRIGGER price_order_item_trigger
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.price_order_item();

-- ---------------------------------------------------------------------------
-- 4. The order's amounts, from its items
-- ---------------------------------------------------------------------------

-- The same sums checkout shows (src/pages/Checkout.tsx, src/lib/coupons.ts):
-- coupon on the lines it covers, split by value (the last line takes the
-- rounding); shipping per boutique from its flat rate and free-shipping
-- threshold while customer shipping is switched on; the COD charge from its
-- quote. Raises when the coupon or the COD charge no longer holds.
CREATE OR REPLACE FUNCTION public.price_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  d public.discounts;
  v_subtotal numeric;
  v_covered numeric := 0;
  v_covered_lines integer := 0;
  v_discount numeric := 0;
  v_counted boolean;
  v_left numeric;
  v_share numeric;
  v_i integer := 0;
  v_charge_shipping boolean;
  v_group_shipping numeric;
  v_shipping numeric := 0;
  v_goods_due numeric;
  v_items_key text;
  it record;
  g record;
  vo record;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT coalesce(round(sum(price * quantity), 2), 0) INTO v_subtotal
  FROM public.order_items WHERE order_id = o.id;

  -- Coupon. Its use is counted here, once per order (an order already
  -- carrying a discount was counted when it got it); abandon_checkout gives
  -- the use back.
  v_counted := coalesce(o.discount_amount, 0) > 0;
  UPDATE public.order_items SET discount_amount = 0 WHERE order_id = o.id AND discount_amount IS DISTINCT FROM 0;
  IF nullif(btrim(o.discount_code), '') IS NOT NULL THEN
    SELECT * INTO d FROM public.discounts WHERE code = upper(btrim(o.discount_code)) AND is_active;
    IF NOT FOUND
       OR (d.starts_at IS NOT NULL AND d.starts_at > now())
       OR (d.expires_at IS NOT NULL AND d.expires_at < now())
       OR (NOT v_counted AND d.max_uses IS NOT NULL AND d.used_count >= d.max_uses) THEN
      RAISE EXCEPTION 'The coupon % can''t be used any more - please remove it and try again.', o.discount_code
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT coalesce(round(sum(oi.price * oi.quantity), 2), 0), count(*)
    INTO v_covered, v_covered_lines
    FROM public.order_items oi
    JOIN public.products p ON p.id::text = oi.product_id
    WHERE oi.order_id = o.id
      AND oi.price * oi.quantity > 0
      AND (coalesce(cardinality(d.category_ids), 0) = 0 OR p.category_id = ANY (d.category_ids))
      AND (coalesce(cardinality(d.product_ids), 0) = 0 OR p.id = ANY (d.product_ids))
      AND (d.vendor_id IS NULL OR oi.vendor_id = d.vendor_id);
    IF v_covered_lines = 0 THEN
      RAISE EXCEPTION 'The coupon % isn''t for any item in this order.', o.discount_code USING ERRCODE = 'check_violation';
    END IF;
    IF v_covered < coalesce(d.min_order_amount, 0) THEN
      RAISE EXCEPTION 'The coupon % needs a minimum order of Rs %.', o.discount_code, d.min_order_amount
        USING ERRCODE = 'check_violation';
    END IF;

    v_discount := CASE WHEN d.discount_type = 'percentage'
      THEN round(v_covered * least(greatest(d.discount_value, 0), 100) / 100, 2)
      ELSE round(least(greatest(d.discount_value, 0), v_covered), 2) END;

    IF NOT v_counted AND v_discount > 0 THEN
      UPDATE public.discounts SET used_count = used_count + 1
      WHERE id = d.id AND (max_uses IS NULL OR used_count < max_uses);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The coupon % can''t be used any more - please remove it and try again.', o.discount_code
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    v_left := v_discount;
    FOR it IN
      SELECT oi.id, round(oi.price * oi.quantity, 2) AS amount
      FROM public.order_items oi
      JOIN public.products p ON p.id::text = oi.product_id
      WHERE oi.order_id = o.id
        AND oi.price * oi.quantity > 0
        AND (coalesce(cardinality(d.category_ids), 0) = 0 OR p.category_id = ANY (d.category_ids))
        AND (coalesce(cardinality(d.product_ids), 0) = 0 OR p.id = ANY (d.product_ids))
        AND (d.vendor_id IS NULL OR oi.vendor_id = d.vendor_id)
      ORDER BY oi.created_at, oi.id
    LOOP
      v_i := v_i + 1;
      v_share := CASE WHEN v_i = v_covered_lines THEN v_left ELSE round(v_discount * it.amount / v_covered, 2) END;
      UPDATE public.order_items SET discount_amount = least(v_share, it.amount) WHERE id = it.id;
      v_left := v_left - v_share;
    END LOOP;
  END IF;

  -- Shipping, per boutique, on its goods before the coupon. (The amounts on
  -- a boutique's part are otherwise kept as they were in a customer's
  -- session - protect_vendor_order_payout_fields - as for the fee
  -- calculation.)
  SELECT coalesce(ps.customer_shipping_enabled, false) INTO v_charge_shipping
  FROM public.platform_settings ps WHERE ps.id;
  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  FOR g IN
    SELECT oi.vendor_id, round(sum(oi.price * oi.quantity), 2) AS goods,
           v.id AS vendor_found, v.shipping_flat_rate, v.free_shipping_threshold
    FROM public.order_items oi
    LEFT JOIN public.vendors v ON v.id = oi.vendor_id
    WHERE oi.order_id = o.id
    GROUP BY oi.vendor_id, v.id, v.shipping_flat_rate, v.free_shipping_threshold
  LOOP
    v_group_shipping := CASE
      WHEN NOT coalesce(v_charge_shipping, false) THEN 0
      WHEN g.vendor_found IS NULL THEN CASE WHEN g.goods >= 999 THEN 0 ELSE 99 END
      WHEN g.free_shipping_threshold IS NOT NULL AND g.goods >= g.free_shipping_threshold THEN 0
      ELSE coalesce(g.shipping_flat_rate, 99)
    END;
    v_shipping := v_shipping + v_group_shipping;
    IF g.vendor_id IS NOT NULL THEN
      UPDATE public.vendor_orders SET subtotal = g.goods, shipping_cost = v_group_shipping
      WHERE order_id = o.id AND vendor_id = g.vendor_id;
    END IF;
  END LOOP;
  PERFORM set_config('app.vendor_order_fee_calc', 'off', true);

  IF EXISTS (
    SELECT 1 FROM public.vendor_orders vo2
    WHERE vo2.order_id = o.id
      AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.vendor_order_id = vo2.id)
  ) THEN
    RAISE EXCEPTION 'Something went wrong saving your order - please try again.' USING ERRCODE = 'check_violation';
  END IF;

  v_goods_due := round(v_subtotal - v_discount + v_shipping, 2);

  -- Cash on Delivery: the charge shiprocket-cod-charge quoted for exactly
  -- these pieces to this PIN code at this value.
  IF o.payment_method = 'cod' THEN
    SELECT string_agg(x.product_id || ':' || x.qty, ',' ORDER BY x.product_id COLLATE "C")
    INTO v_items_key
    FROM (
      SELECT oi.product_id, sum(oi.quantity) AS qty
      FROM public.order_items oi
      WHERE oi.order_id = o.id AND oi.vendor_id IS NOT NULL
      GROUP BY oi.product_id
    ) x;
    IF NOT EXISTS (
      SELECT 1 FROM public.cod_charge_quotes q
      WHERE q.delivery_pincode = o.shipping_address->>'pincode'
        AND q.items_key = v_items_key
        AND abs(q.order_value - v_goods_due) <= 1
        AND q.cod_charge = o.cod_charge
        AND q.created_at > now() - interval '6 hours'
    ) THEN
      RAISE EXCEPTION 'The Cash on Delivery charge has changed - please check your order and place it again.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.orders
  SET subtotal = v_subtotal,
      discount_amount = v_discount,
      shipping_cost = v_shipping,
      cod_charge = CASE WHEN o.payment_method = 'cod' THEN o.cod_charge ELSE 0 END,
      total = round(v_goods_due + CASE WHEN o.payment_method = 'cod' THEN o.cod_charge ELSE 0 END, 2)
  WHERE id = o.id;

  FOR vo IN SELECT id FROM public.vendor_orders WHERE order_id = o.id LOOP
    PERFORM public.compute_vendor_order_fees(vo.id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.price_order(uuid) FROM PUBLIC, anon, authenticated;

-- Checkout saves all of an order's items in one insert; price the order
-- once they're all in.
CREATE OR REPLACE FUNCTION public.price_orders_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NULL;
  END IF;
  FOR r IN SELECT DISTINCT order_id FROM new_items LOOP
    PERFORM public.price_order(r.order_id);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS price_orders_from_items_trigger ON public.order_items;
CREATE TRIGGER price_orders_from_items_trigger
  AFTER INSERT ON public.order_items
  REFERENCING NEW TABLE AS new_items
  FOR EACH STATEMENT EXECUTE FUNCTION public.price_orders_from_items();
