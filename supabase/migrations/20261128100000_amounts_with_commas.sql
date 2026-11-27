-- Every amount on the site with Indian commas (client, 28 Nov 2026:
-- "₹1,53,400 · ₹59,000 · ₹3,200"). Four messages still printed the bare
-- number - "needs a minimum order of Rs 15000" at checkout, and three wallet
-- messages. They now use inr() (20261025100000_inr_indian_commas), like the
-- notifications: ₹15,000, ₹12,34,567.50.
--
-- Each function is exactly as its last migration left it (checked against
-- live on 28 Nov 2026), with only that message changed:
--   price_order            - 20261113120000_cod_fee_3pct
--   apply_wallet_to_order, wallet_refund, admin_adjust_wallet
--                          - 20261102100000_customer_wallet
-- CREATE OR REPLACE keeps each function's grants.

-- price_order: as 20261113120000_cod_fee_3pct, the message with inr().
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
  v_is_cod boolean;
  v_fee numeric;
  v_fee_gst numeric;
  v_cod numeric := 0;
  it record;
  g record;
  vo record;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_is_cod := o.payment_method = 'cod';

  SELECT coalesce(round(sum(price * quantity), 2), 0) INTO v_subtotal
  FROM public.order_items WHERE order_id = o.id;

  -- Coupon.
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
      RAISE EXCEPTION 'The coupon % needs a minimum order of %.', o.discount_code, public.inr(d.min_order_amount)
        USING ERRCODE = 'check_violation';
    END IF;

    v_discount := CASE WHEN d.discount_type = 'percentage'
      THEN round(v_covered * least(greatest(d.discount_value, 0), 100) / 100, 2)
      ELSE round(least(greatest(d.discount_value, 0), v_covered), 2) END;

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

  -- Shipping, per boutique, on its goods before the coupon; then, on Cash on
  -- Delivery, the part's COD fee on what it comes to (goods - its coupon
  -- share + shipping). (The amounts on a boutique's part are otherwise kept
  -- as they were in a customer's session - protect_vendor_order_payout_fields
  -- - as for the fee calculation.)
  SELECT coalesce(ps.customer_shipping_enabled, false) INTO v_charge_shipping
  FROM public.platform_settings ps WHERE ps.id;
  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  FOR g IN
    SELECT oi.vendor_id, round(sum(oi.price * oi.quantity), 2) AS goods,
           round(sum(coalesce(oi.discount_amount, 0)), 2) AS discount,
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
    v_fee := 0;
    v_fee_gst := 0;
    IF v_is_cod THEN
      SELECT f.fee, f.gst INTO v_fee, v_fee_gst
      FROM public.cod_fee_of(round(g.goods - g.discount + v_group_shipping, 2)) f;
      v_cod := v_cod + v_fee + v_fee_gst;
    END IF;
    IF g.vendor_id IS NOT NULL THEN
      UPDATE public.vendor_orders
      SET subtotal = g.goods, shipping_cost = v_group_shipping,
          cod_fee_amount = v_fee, cod_fee_gst_amount = v_fee_gst
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
  v_cod := round(v_cod, 2);

  -- Cash on Delivery: a courier collects cash at this PIN code for exactly
  -- these pieces at this value (shiprocket-cod-charge's quote), and the fee
  -- the customer was shown is the one worked out here (within Rs 1 - a
  -- paisa of rounding in a coupon split between boutiques can move it).
  IF v_is_cod THEN
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
        AND q.created_at > now() - interval '6 hours'
    ) OR abs(coalesce(o.cod_charge, 0) - v_cod) > 1 THEN
      RAISE EXCEPTION 'The Cash on Delivery fee has changed - please check your order and place it again.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.orders
  SET subtotal = v_subtotal,
      discount_amount = v_discount,
      shipping_cost = v_shipping,
      cod_charge = CASE WHEN v_is_cod THEN v_cod ELSE 0 END,
      total = round(v_goods_due + CASE WHEN v_is_cod THEN v_cod ELSE 0 END, 2)
  WHERE id = o.id;

  FOR vo IN SELECT id FROM public.vendor_orders WHERE order_id = o.id LOOP
    PERFORM public.compute_vendor_order_fees(vo.id);
  END LOOP;
END;
$$;

-- apply_wallet_to_order: as 20261102100000_customer_wallet, the message with inr().
CREATE OR REPLACE FUNCTION public.apply_wallet_to_order(_order_id uuid, _amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  v_balance numeric;
  v_vendor_order record;
BEGIN
  _amount := round(coalesce(_amount, 0), 2);
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Nothing to pay from the wallet';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.order_status <> 'pending' OR o.payment_status <> 'pending' OR o.wallet_amount > 0
     OR o.created_at < now() - interval '30 minutes' THEN
    RAISE EXCEPTION 'This order can no longer be paid from the wallet';
  END IF;
  IF o.payment_method = 'cod' THEN
    RAISE EXCEPTION 'Wallet balance can''t be combined with Cash on Delivery - pay the rest online';
  END IF;
  IF _amount > o.total THEN
    RAISE EXCEPTION 'That is more than the order total';
  END IF;
  IF (o.payment_method = 'wallet') <> (_amount = o.total) THEN
    RAISE EXCEPTION 'The wallet amount doesn''t match how this order is being paid';
  END IF;

  -- One spend at a time per customer, so two open checkouts can't both
  -- spend the same balance.
  PERFORM pg_advisory_xact_lock(hashtextextended('wallet:' || o.user_id::text, 0));
  v_balance := public.wallet_balance(o.user_id);
  IF _amount > v_balance THEN
    RAISE EXCEPTION 'Your wallet balance is now %. Please check your order and try again.', public.inr(v_balance);
  END IF;

  INSERT INTO public.wallet_transactions (user_id, amount, kind, order_id, created_by, source_key)
  VALUES (o.user_id, -_amount, 'order_payment', o.id, auth.uid(), 'order_payment:' || o.id);

  IF o.payment_method = 'wallet' THEN
    UPDATE public.payments SET amount = _amount, payment_status = 'paid'
    WHERE order_id = o.id AND payment_status = 'pending';
    UPDATE public.orders SET wallet_amount = _amount, payment_status = 'paid' WHERE id = o.id;
  ELSE
    -- The payment row is what Razorpay is charging: the rest.
    UPDATE public.payments SET amount = o.total - _amount
    WHERE order_id = o.id AND payment_status = 'pending';
    UPDATE public.orders SET wallet_amount = _amount WHERE id = o.id;
  END IF;

  -- The boutiques' fees were worked out when the items were saved, before
  -- the wallet part was known; the gateway fee is only on the online part.
  FOR v_vendor_order IN SELECT id FROM public.vendor_orders WHERE order_id = o.id LOOP
    PERFORM public.compute_vendor_order_fees(v_vendor_order.id);
  END LOOP;
  RETURN _amount;
END;
$$;

-- wallet_refund: as 20261102100000_customer_wallet, the message with inr().
CREATE OR REPLACE FUNCTION public.wallet_refund(
  _order_id uuid,
  _amount numeric,
  _kind text,
  _source_key text,
  _return_request_id uuid DEFAULT NULL,
  _vendor_order_id uuid DEFAULT NULL,
  _note text DEFAULT NULL,
  _created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  v_id uuid;
  v_left numeric;
BEGIN
  _amount := round(coalesce(_amount, 0), 2);
  IF _amount <= 0 THEN RAISE EXCEPTION 'A positive amount is required'; END IF;
  IF _kind NOT IN ('return_refund', 'cancellation_refund') THEN RAISE EXCEPTION 'Not a refund: %', _kind; END IF;
  IF coalesce(_source_key, '') = '' THEN RAISE EXCEPTION 'A source key is required'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT id INTO v_id FROM public.wallet_transactions WHERE source_key = _source_key;
  IF FOUND THEN RETURN v_id; END IF;

  IF o.user_id IS NULL THEN RAISE EXCEPTION 'This order has no customer account to refund into'; END IF;
  v_left := public.order_refundable_amount(o.id);
  IF _amount > v_left THEN
    RAISE EXCEPTION 'Refund of % is more than is left to refund on this order (%)', public.inr(_amount), public.inr(v_left);
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, amount, kind, order_id, return_request_id, vendor_order_id, note, created_by, source_key)
  VALUES (o.user_id, _amount, _kind, o.id, _return_request_id, _vendor_order_id, _note, _created_by, _source_key)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- admin_adjust_wallet: as 20261102100000_customer_wallet, the message with inr().
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(_user_id uuid, _amount numeric, _note text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can adjust a wallet'; END IF;
  _amount := round(coalesce(_amount, 0), 2);
  IF _amount = 0 THEN RAISE EXCEPTION 'Enter an amount'; END IF;
  IF coalesce(trim(_note), '') = '' THEN RAISE EXCEPTION 'Say why the wallet is being adjusted'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('wallet:' || _user_id::text, 0));
  IF public.wallet_balance(_user_id) + _amount < 0 THEN
    RAISE EXCEPTION 'The wallet only holds %', public.inr(public.wallet_balance(_user_id));
  END IF;
  INSERT INTO public.wallet_transactions (user_id, amount, kind, note, created_by, source_key)
  VALUES (_user_id, _amount, 'adjustment', trim(_note), auth.uid(), 'adjustment:' || gen_random_uuid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
