-- Fixed courier charge in the customer price (client, 10 Nov 2026 - "option
-- B"): MRP = Product Value + GST on it + Rs 500 courier, per piece.
--
-- Shipping is AllBoutiqs' own supply to the customer (client, same day), so
-- the courier is never the boutique's:
--   * the GST band (apparel 5% up to Rs 2,500, more above) is on the Product
--     Value alone - the courier never pushes a piece into a higher rate;
--   * the boutique's goods, tax invoice, fees, TCS, TDS and payout leave it
--     out; AllBoutiqs bills it to the customer on its own invoice (Rs 500
--     including 18% GST, SAC 996812);
--   * a coupon takes money off the goods only, never off the courier.
-- Each order line keeps the courier per piece it was sold with
-- (order_items.delivery_charge); orders placed before this have 0, so their
-- figures don't change.
--
-- Refunds (client, same day): a refund gives the customer back what they
-- paid for the piece, the courier included; the courier is never the
-- boutique's, whatever happens (a return, RTO, an item failing the
-- warehouse check).

-- ---------------------------------------------------------------------------
-- 1. The setting
-- ---------------------------------------------------------------------------

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS delivery_charge_per_piece numeric(10,2) NOT NULL DEFAULT 500
    CHECK (delivery_charge_per_piece >= 0 AND delivery_charge_per_piece <= 100000),
  ADD COLUMN IF NOT EXISTS delivery_charge_gst_pct numeric(5,2) NOT NULL DEFAULT 18
    CHECK (delivery_charge_gst_pct >= 0 AND delivery_charge_gst_pct <= 40),
  ADD COLUMN IF NOT EXISTS delivery_charge_sac text NOT NULL DEFAULT '996812';

COMMENT ON COLUMN public.platform_settings.delivery_charge_per_piece IS
  'AllBoutiqs courier charge per piece, GST included, added to every customer price (MRP)';

CREATE OR REPLACE FUNCTION public.delivery_charge_per_piece()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT delivery_charge_per_piece FROM public.platform_settings WHERE id), 0);
$$;
GRANT EXECUTE ON FUNCTION public.delivery_charge_per_piece() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Product prices: Product Value + GST + courier
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.customer_price_for(_category_id uuid, _value numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(public.price_with_gst(_category_id, _value) + public.delivery_charge_per_piece(), 2);
$$;
GRANT EXECUTE ON FUNCTION public.customer_price_for(uuid, numeric) TO anon, authenticated;

-- A customer price now includes the courier: take it off before taking the
-- GST back out (for writers that still send a price).
CREATE OR REPLACE FUNCTION public.value_from_price(_category_id uuid, _price numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH g AS (SELECT greatest(_price - public.delivery_charge_per_piece(), 0) AS goods)
  SELECT round(g.goods / (1 + coalesce((
    SELECT public.gst_rate_for(c.hsn_code_id, g.goods)
    FROM public.categories c
    WHERE c.id = _category_id AND c.hsn_code_id IS NOT NULL
  ), 0) / 100), 2)
  FROM g;
$$;

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
    NEW.price := public.customer_price_for(NEW.category_id, NEW.product_value);
  END IF;
  NEW.compare_at_price := CASE WHEN NEW.compare_at_value IS NULL THEN NULL
                               ELSE public.customer_price_for(NEW.category_id, NEW.compare_at_value) END;
  RETURN NEW;
END;
$$;

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
    NEW.price := public.customer_price_for(v_category, NEW.product_value);
  END IF;
  RETURN NEW;
END;
$$;

-- A new courier charge re-prices every product at once, so a price always
-- holds the courier an order line will be given.
CREATE OR REPLACE FUNCTION public.reprice_products_on_delivery_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products SET product_value = product_value WHERE product_value IS NOT NULL;
  UPDATE public.product_variants SET product_value = product_value WHERE product_value IS NOT NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reprice_products_on_delivery_charge ON public.platform_settings;
CREATE TRIGGER reprice_products_on_delivery_charge
  AFTER UPDATE OF delivery_charge_per_piece ON public.platform_settings
  FOR EACH ROW WHEN (OLD.delivery_charge_per_piece IS DISTINCT FROM NEW.delivery_charge_per_piece)
  EXECUTE FUNCTION public.reprice_products_on_delivery_charge();

-- Every product's MRP takes the courier now.
UPDATE public.products SET product_value = product_value WHERE product_value IS NOT NULL;
UPDATE public.product_variants SET product_value = product_value WHERE product_value IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Order lines keep the courier they were sold with
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS delivery_charge numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0);
COMMENT ON COLUMN public.order_items.delivery_charge IS
  'AllBoutiqs courier per piece (GST included) inside price - not the boutique''s; 0 on orders before 10 Nov 2026';

-- As 20261103150000_server_side_order_prices, plus the courier per piece.
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
  -- The courier inside that price (never more than the piece's own price).
  NEW.delivery_charge := least(public.delivery_charge_per_piece(), coalesce(v_variant_price, p.price));
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

-- ---------------------------------------------------------------------------
-- 4. The order's amounts: coupon on the goods only
-- ---------------------------------------------------------------------------

-- As 20261103150000_server_side_order_prices, except that the coupon covers
-- each line's goods (price less courier) - src/lib/coupons.ts does the same.
-- The order's subtotal and total, and each part's vendor_orders.subtotal,
-- stay what the customer pays (courier included): Cash on Delivery
-- collection, cancellation refunds and courier bookings all read them. The
-- boutique's own goods are vendor_orders.goods_value (after coupon, no
-- courier).
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

  -- Coupon, on the goods (never the courier).
  UPDATE public.order_items SET discount_amount = 0 WHERE order_id = o.id AND discount_amount IS DISTINCT FROM 0;
  IF nullif(btrim(o.discount_code), '') IS NOT NULL THEN
    SELECT * INTO d FROM public.discounts WHERE code = upper(btrim(o.discount_code)) AND is_active;
    IF NOT FOUND
       OR (d.starts_at IS NOT NULL AND d.starts_at > now())
       OR (d.expires_at IS NOT NULL AND d.expires_at < now())
       OR (d.max_uses IS NOT NULL AND d.used_count >= d.max_uses) THEN
      RAISE EXCEPTION 'The coupon % can''t be used any more - please remove it and try again.', o.discount_code
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT coalesce(round(sum((oi.price - oi.delivery_charge) * oi.quantity), 2), 0), count(*)
    INTO v_covered, v_covered_lines
    FROM public.order_items oi
    JOIN public.products p ON p.id::text = oi.product_id
    WHERE oi.order_id = o.id
      AND (oi.price - oi.delivery_charge) * oi.quantity > 0
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

    v_left := v_discount;
    FOR it IN
      SELECT oi.id, round((oi.price - oi.delivery_charge) * oi.quantity, 2) AS amount
      FROM public.order_items oi
      JOIN public.products p ON p.id::text = oi.product_id
      WHERE oi.order_id = o.id
        AND (oi.price - oi.delivery_charge) * oi.quantity > 0
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
    -- What checkout shows (courier included): the free-shipping threshold is
    -- on that, as in Checkout.tsx, and it is the part's subtotal.
    SELECT oi.vendor_id, round(sum(oi.price * oi.quantity), 2) AS gross,
           v.id AS vendor_found, v.shipping_flat_rate, v.free_shipping_threshold
    FROM public.order_items oi
    LEFT JOIN public.vendors v ON v.id = oi.vendor_id
    WHERE oi.order_id = o.id
    GROUP BY oi.vendor_id, v.id, v.shipping_flat_rate, v.free_shipping_threshold
  LOOP
    v_group_shipping := CASE
      WHEN NOT coalesce(v_charge_shipping, false) THEN 0
      WHEN g.vendor_found IS NULL THEN CASE WHEN g.gross >= 999 THEN 0 ELSE 99 END
      WHEN g.free_shipping_threshold IS NOT NULL AND g.gross >= g.free_shipping_threshold THEN 0
      ELSE coalesce(g.shipping_flat_rate, 99)
    END;
    v_shipping := v_shipping + v_group_shipping;
    IF g.vendor_id IS NOT NULL THEN
      UPDATE public.vendor_orders SET subtotal = g.gross, shipping_cost = v_group_shipping
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

-- ---------------------------------------------------------------------------
-- 5. Boutique fees on its goods only (as 20261102100000_customer_wallet,
--    with each line's courier taken off)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_vendor_order_fees(_vendor_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  vo public.vendor_orders;
  o public.orders;
  r public.platform_rates;
  it record;
  v_gstin text;
  v_pan text;
  v_constitution text;
  v_supply text;
  v_gross numeric;
  v_disc numeric;
  v_net numeric;
  v_rate numeric;
  v_taxable numeric;
  v_goods numeric := 0;
  v_product numeric := 0;
  v_gst numeric := 0;
  v_hsn_missing boolean := false;
  v_commission_pct numeric;
  v_commission numeric;
  v_tech numeric;
  v_fee_gst numeric;
  v_gateway_rate numeric := 0;
  v_gateway numeric := 0;
  v_ship_to_boutique boolean;
  v_shipping_credit numeric;
  v_courier numeric;
  v_tcs numeric;
  v_tds_rate numeric;
  v_fy_sales numeric;
  v_fy_start date;
  v_tds numeric;
BEGIN
  SELECT * INTO vo FROM vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  -- Money already sent (or batched for sending) stays as it was.
  IF vo.rzp_transfer_id IS NOT NULL OR vo.payout_id IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO o FROM orders WHERE id = vo.order_id;
  r := rates_on(coalesce(o.created_at, now()));
  IF r.id IS NULL THEN RETURN; END IF;

  SELECT coalesce(k.gstin, v.gst_number), coalesce(k.pan, v.pan_number), k.business_constitution
  INTO v_gstin, v_pan, v_constitution
  FROM vendors v LEFT JOIN vendor_kyc k ON k.vendor_id = v.id
  WHERE v.id = vo.vendor_id;
  v_supply := CASE WHEN v_gstin IS NOT NULL AND left(v_gstin, 2) = gst_state_code(o.shipping_address->>'state')
                   THEN 'intra_state' ELSE 'inter_state' END;

  FOR it IN
    SELECT oi.price, oi.quantity, oi.discount_amount, oi.delivery_charge, c.hsn_code_id
    FROM order_items oi
    LEFT JOIN products p ON p.id::text = oi.product_id::text
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE oi.vendor_order_id = vo.id
  LOOP
    -- The boutique's goods: the price without AllBoutiqs' courier.
    v_gross := (it.price - coalesce(it.delivery_charge, 0)) * it.quantity;
    -- The coupon share checkout recorded for this line (only the lines the
    -- coupon covered have one); orders from before that share it by value.
    v_disc := coalesce(it.discount_amount,
      CASE WHEN coalesce(o.subtotal, 0) > 0 THEN round(coalesce(o.discount_amount, 0) * v_gross / o.subtotal, 2) ELSE 0 END);
    v_net := v_gross - v_disc;
    v_rate := gst_rate_for(it.hsn_code_id, v_net / greatest(it.quantity, 1));
    IF v_rate IS NULL THEN
      v_hsn_missing := true;
      v_rate := 0;
    END IF;
    v_taxable := round(v_net / (1 + v_rate / 100), 2);
    v_goods := v_goods + v_net;
    v_product := v_product + v_taxable;
    v_gst := v_gst + (v_net - v_taxable);
  END LOOP;

  v_commission_pct := effective_commission_pct(vo.vendor_id, coalesce(o.created_at, now()));
  v_commission := round(v_product * v_commission_pct / 100, 2);
  v_tech := round(v_product * r.technology_fee_pct / 100, 2);
  v_fee_gst := round((v_commission + v_tech) * r.fee_gst_pct / 100, 2);

  -- Courier: when AllBoutiqs bears it, the customer's shipping charge is
  -- AllBoutiqs' too; when charged to the boutique, the boutique gets the
  -- shipping charge and pays the courier cost (filled in once booked).
  v_ship_to_boutique := r.charge_courier_to_boutique;
  v_shipping_credit := CASE WHEN v_ship_to_boutique THEN coalesce(vo.shipping_cost, 0) ELSE 0 END;
  v_courier := CASE WHEN v_ship_to_boutique THEN coalesce(vo.courier_charge, 0) ELSE 0 END;

  -- Only the part paid online carries the gateway fee - not what the
  -- customer paid from their wallet (no gateway took that). On the
  -- boutique's goods only: AllBoutiqs bears the fee on its own courier.
  IF o.payment_method = 'razorpay' THEN
    v_gateway_rate := r.payment_gateway_fee_pct;
    v_gateway := round((v_goods + coalesce(vo.shipping_cost, 0)) * v_gateway_rate / 100
                       * CASE WHEN coalesce(o.total, 0) > 0
                              THEN greatest(o.total - coalesce(o.wallet_amount, 0), 0) / o.total
                              ELSE 1 END, 2);
  END IF;

  v_tcs := round(v_product * r.gst_tcs_pct / 100, 2);

  -- Income-tax TDS (194-O): no PAN -> higher rate; individuals
  -- (proprietorships) and HUFs with PAN are free until their sales this
  -- financial year pass the limit; firms and companies from the first order.
  IF v_pan IS NULL THEN
    v_tds_rate := r.tds_no_pan_pct;
  ELSIF coalesce(v_constitution, 'proprietorship') IN ('proprietorship', 'huf') THEN
    v_fy_start := make_date(
      CASE WHEN extract(month FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata')) >= 4
           THEN extract(year FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata'))::int
           ELSE extract(year FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata'))::int - 1 END, 4, 1);
    SELECT coalesce(sum(x.product_value), 0) INTO v_fy_sales
    FROM vendor_orders x JOIN orders xo ON xo.id = x.order_id
    WHERE x.vendor_id = vo.vendor_id AND x.id <> vo.id AND x.status <> 'cancelled'
      AND (xo.created_at AT TIME ZONE 'Asia/Kolkata')::date >= v_fy_start
      AND xo.created_at <= coalesce(o.created_at, now());
    v_tds_rate := CASE WHEN v_fy_sales + v_product > r.tds_individual_exempt_upto THEN r.tds_pct ELSE 0 END;
  ELSE
    v_tds_rate := r.tds_pct;
  END IF;
  v_tds := round(v_product * v_tds_rate / 100, 2);

  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  UPDATE vendor_orders SET
    rates_effective_from = r.effective_from,
    goods_value = v_goods,
    product_value = v_product,
    goods_gst = v_gst,
    supply_type = v_supply,
    commission_rate = v_commission_pct,
    commission_amount = v_commission,
    tech_fee_rate = r.technology_fee_pct,
    tech_fee_amount = v_tech,
    fee_gst_rate = r.fee_gst_pct,
    fee_gst_amount = v_fee_gst,
    gateway_fee_rate = v_gateway_rate,
    gateway_fee_amount = v_gateway,
    shipping_to_boutique = v_ship_to_boutique,
    tcs_rate = r.gst_tcs_pct,
    tcs_amount = v_tcs,
    tds_rate = v_tds_rate,
    tds_amount = v_tds,
    hsn_missing = v_hsn_missing,
    net_payable = round(v_goods + v_shipping_credit - v_commission - v_tech - v_fee_gst - v_gateway
                        - v_courier
                        -- The customer paid the COD charge at checkout (Extra
                        -- list M): the boutique doesn't pay it as well.
                        - CASE WHEN coalesce(o.cod_charge, 0) > 0 THEN 0 ELSE coalesce(vo.cod_handling_charge, 0) END
                        - v_tcs - v_tds, 2),
    fees_computed_at = now()
  WHERE id = vo.id;
  PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Statement lines: refunds split into the boutique's goods and AllBoutiqs'
--    courier; the courier on each part shown (for AllBoutiqs' side)
-- ---------------------------------------------------------------------------
-- As 20261025180000_cod_charge_to_customer, except: "refunded" and the TCS
-- base use only the goods part of a refund, and two columns are added at the
-- end - delivery_charge (AllBoutiqs' courier the customer paid on this part)
-- and delivery_refunded. Each refund is the goods first (the sale is undone
-- in full for GST and TCS), anything above them is the courier - so a refund
-- charge kept on a bank refund comes off AllBoutiqs' courier part.
DROP FUNCTION IF EXISTS public.statement_lines(uuid, date, date);

CREATE OR REPLACE FUNCTION public.statement_lines(_vendor_id uuid, _from date, _to date)
 RETURNS TABLE(vendor_id uuid, boutique_code text, boutique_name text, vendor_order_id uuid, order_number text, order_date date, delivered_on date, status text, payment_method text, supply_type text, goods_value numeric, product_value numeric, gst numeric, commission numeric, tech_fee numeric, fee_gst numeric, gateway_fee numeric, courier numeric, cod_charge numeric, refunded numeric, net_taxable numeric, tcs_rate numeric, tcs_cgst numeric, tcs_sgst numeric, tcs_igst numeric, tds_rate numeric, tds numeric, net_payout numeric, payout_status text, payment_date date, utr text, fee_invoice_number text, discount numeric, shipping_credit numeric, delivery_charge numeric, delivery_refunded numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT (_vendor_id IS NOT NULL AND public.is_vendor_member(auth.uid(), _vendor_id))
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'You can only download your own statement';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT vo.*, o.created_at AS order_created, o.payment_method AS pay_method, o.cod_charge AS customer_cod,
           v.boutique_code AS bcode, v.name AS bname,
           vp.paid_at AS manual_paid_at, vp.payment_reference AS manual_utr,
           fi.invoice_number AS fee_inv,
           -- This boutique's share of the coupon: what checkout recorded on
           -- its lines, or (older orders) the order's discount by value.
           coalesce(
             (SELECT CASE WHEN bool_or(oi.discount_amount IS NOT NULL) THEN sum(coalesce(oi.discount_amount, 0)) END
              FROM order_items oi WHERE oi.vendor_order_id = vo.id),
             CASE WHEN coalesce(o.subtotal, 0) > 0 THEN round(coalesce(o.discount_amount, 0) * vo.subtotal / o.subtotal, 2) ELSE 0 END
           ) AS disc_share,
           -- AllBoutiqs' courier on this part.
           (SELECT coalesce(round(sum(oi.delivery_charge * oi.quantity), 2), 0)
              FROM order_items oi WHERE oi.vendor_order_id = vo.id) AS delivery_total
    FROM vendor_orders vo
    JOIN orders o ON o.id = vo.order_id
    JOIN vendors v ON v.id = vo.vendor_id
    LEFT JOIN vendor_payouts vp ON vp.id = vo.payout_id
    LEFT JOIN fee_invoices fi ON fi.id = vo.fee_invoice_id
    WHERE (_vendor_id IS NULL OR vo.vendor_id = _vendor_id)
      AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
      AND public.order_is_placed(o.payment_method, o.payment_status)
  ),
  -- Refunds that reached the customer, per boutique order: cancellations
  -- directly; returns shared across their items' boutique orders by value.
  cancel_refunds AS (
    SELECT oc.vendor_order_id AS vo_id, sum(r.amount) AS amt
    FROM order_cancellations oc JOIN refunds r ON r.id = oc.refund_id
    WHERE r.status = 'processed' AND oc.vendor_order_id IN (SELECT id FROM base)
    GROUP BY oc.vendor_order_id
  ),
  return_items AS (
    -- The returned pieces' goods (after their coupon share) and courier.
    SELECT r.id AS refund_id, r.amount, oi.vendor_order_id AS vo_id,
           (oi.price - oi.delivery_charge - coalesce(oi.discount_amount, 0) / greatest(oi.quantity, 1))
             * coalesce((elem->>'quantity')::int, oi.quantity) AS item_goods,
           oi.delivery_charge * coalesce((elem->>'quantity')::int, oi.quantity) AS item_delivery
    FROM refunds r
    JOIN return_requests rr ON rr.id = r.return_request_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(rr.items, '[]'::jsonb)) AS elem
    JOIN order_items oi ON oi.id = (elem->>'order_item_id')::uuid
    WHERE r.status = 'processed' AND oi.vendor_order_id IN (SELECT id FROM base)
  ),
  return_refunds AS (
    SELECT ri.vo_id,
           sum(least(ri.amount, t.total_goods) * ri.item_goods / nullif(t.total_goods, 0)) AS amt,
           sum(least(greatest(ri.amount - t.total_goods, 0), t.total_delivery) * ri.item_delivery / nullif(t.total_delivery, 0)) AS delivery_amt
    FROM return_items ri
    JOIN (SELECT refund_id, sum(item_goods) AS total_goods, sum(item_delivery) AS total_delivery
          FROM return_items GROUP BY refund_id) t ON t.refund_id = ri.refund_id
    GROUP BY ri.vo_id
  ),
  -- Goods first, the rest courier (see above).
  calc AS (
    SELECT b.*,
           round(least(coalesce(cr.amt, 0), b.goods_value) + coalesce(rf.amt, 0), 2) AS refunded_amt,
           round(least(greatest(coalesce(cr.amt, 0) - b.goods_value, 0), b.delivery_total)
                 + coalesce(rf.delivery_amt, 0), 2) AS delivery_refund_amt,
           (b.status = 'cancelled') AS is_cancelled
    FROM base b
    LEFT JOIN cancel_refunds cr ON cr.vo_id = b.id
    LEFT JOIN return_refunds rf ON rf.vo_id = b.id
  ),
  taxed AS (
    SELECT c.*,
           CASE WHEN c.is_cancelled THEN 0
                ELSE greatest(0, c.product_value - CASE WHEN c.goods_value > 0
                     THEN round(least(c.refunded_amt, c.goods_value) * c.product_value / c.goods_value, 2) ELSE 0 END)
           END AS net_tax
    FROM calc c
  )
  SELECT t.vendor_id, t.bcode, t.bname, t.id,
         '#' || upper(left(t.order_id::text, 8)),
         (t.order_created AT TIME ZONE 'Asia/Kolkata')::date,
         (t.delivered_at AT TIME ZONE 'Asia/Kolkata')::date,
         t.status, t.pay_method, t.supply_type,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.goods_value END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.product_value END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.goods_gst END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.commission_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.tech_fee_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.fee_gst_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.gateway_fee_amount END,
         t.courier_charge,
         CASE WHEN coalesce(t.customer_cod, 0) > 0 THEN 0 ELSE t.cod_handling_charge END,
         t.refunded_amt, t.net_tax,
         t.tcs_rate,
         CASE WHEN t.supply_type = 'intra_state' THEN round(t.net_tax * t.tcs_rate / 200, 2) ELSE 0 END,
         CASE WHEN t.supply_type = 'intra_state' THEN round(t.net_tax * t.tcs_rate / 100, 2) - round(t.net_tax * t.tcs_rate / 200, 2) ELSE 0 END,
         CASE WHEN t.supply_type = 'intra_state' THEN 0 ELSE round(t.net_tax * t.tcs_rate / 100, 2) END,
         t.tds_rate,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.tds_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.net_payable END,
         CASE WHEN coalesce(t.rzp_settled_at, t.manual_paid_at) IS NOT NULL THEN 'paid'
              WHEN t.rzp_transfer_status = 'released' THEN 'sent'
              ELSE 'pending' END,
         (coalesce(t.rzp_settled_at, t.manual_paid_at) AT TIME ZONE 'Asia/Kolkata')::date,
         coalesce(t.rzp_settlement_utr, t.manual_utr),
         t.fee_inv,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.disc_share END,
         CASE WHEN t.is_cancelled OR NOT t.shipping_to_boutique THEN 0 ELSE coalesce(t.shipping_cost, 0) END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.delivery_total END,
         t.delivery_refund_amt
  FROM taxed t
  ORDER BY t.order_created, t.bname;
END;
$function$;

REVOKE ALL ON FUNCTION public.statement_lines(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.statement_lines(uuid, date, date) TO authenticated, service_role;

