-- Go-live audit (3 Nov), security points:
-- 1. A boutique could approve its own product: "Vendor members can manage
--    their products" lets it write every column, approval_status included.
--    Now only an admin approves; a non-trusted boutique's change to what
--    shoppers see sends an approved product back for review (what the
--    boutique product form already does, now enforced).
-- 2. adjust_stock checked nobody - anyone, even signed out, could set any
--    product's stock (0 = gone from the shop). Now: an admin, the server,
--    the boutique that owns the product, and a shopper's own checkout only
--    for what its order holds.
-- 3. Internal helpers anyone could call: increment_discount_usage (use up any
--    coupon's limit), next_invoice_seq (gaps in invoice numbers),
--    admin_user_ids (lists the admins) and the cron jobs' functions. The
--    coupon's use is now counted by price_order; checkout no longer calls
--    increment_discount_usage.
-- 4. abandon_checkout gave a coupon use back even when none was counted -
--    a checkout that stopped before pricing, then cancelled, lowered the
--    count (repeatable, so a limited coupon became unlimited). Now only a
--    use price_order counted (the order has a discount) comes back. And in
--    a shopper's session (cancel_pending_order) it failed outright -
--    protect_vendor_order_payout_fields refused the boutique part's status
--    change - so a checkout stopped by stock or a price change stayed open.

-- ---------------------------------------------------------------------------
-- 1. Product approval
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_product_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trusted boolean;
BEGIN
  IF public.is_privileged_writer() OR coalesce(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- The rejection reason is the admin's to write; a boutique may clear it.
  IF NEW.rejection_reason IS NOT NULL AND NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;

  -- Trusted partners publish their own listings, as on insert
  -- (set_product_approval_status).
  SELECT is_trusted INTO v_trusted FROM public.vendors WHERE id = NEW.vendor_id;
  IF coalesce(v_trusted, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status = 'approved' AND (
       OLD.approval_status <> 'approved'
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.images IS DISTINCT FROM OLD.images
       OR NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.specifications IS DISTINCT FROM OLD.specifications
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
  ) THEN
    NEW.approval_status := 'pending_review';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_product_approval_trigger ON public.products;
CREATE TRIGGER guard_product_approval_trigger
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_approval();

-- ---------------------------------------------------------------------------
-- 2. adjust_stock: who may move stock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_stock(
  _product_id UUID,
  _variant_id UUID,
  _delta INTEGER,
  _movement_type TEXT,
  _reason TEXT,
  _reference_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resulting INTEGER;
  v_vendor_id UUID;
  v_variant_sum INTEGER;
  v_product_name TEXT;
  v_variant_id UUID;
  v_order_net INTEGER;
  v_ordered INTEGER;
BEGIN
  PERFORM set_config('app.bypass_stock_protection', 'true', true);

  SELECT vendor_id, name INTO v_vendor_id, v_product_name
  FROM public.products WHERE id = _product_id;

  -- A shopper (not the product's boutique, not an admin) only through their
  -- own order: checkout takes ('sale') at most what the order holds, and a
  -- cancelled checkout (abandon_checkout) gives back ('return') at most what
  -- it took.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_privileged_writer()
     AND NOT (v_vendor_id IS NOT NULL AND public.is_vendor_member(auth.uid(), v_vendor_id)) THEN
    SELECT coalesce(sum(change_quantity), 0) INTO v_order_net
    FROM public.stock_movements
    WHERE reference_order_id = _reference_order_id AND product_id = _product_id;
    SELECT coalesce(sum(quantity), 0) INTO v_ordered
    FROM public.order_items
    WHERE order_id = _reference_order_id AND product_id = _product_id::text;

    IF _reference_order_id IS NULL OR auth.uid() IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.orders WHERE id = _reference_order_id AND user_id = auth.uid())
       OR NOT (
         (_movement_type = 'sale' AND _delta < 0 AND -(v_order_net + _delta) <= v_ordered
          AND EXISTS (SELECT 1 FROM public.orders
                      WHERE id = _reference_order_id AND order_status = 'pending'
                        AND created_at > now() - interval '30 minutes'))
         OR (_movement_type = 'return' AND _delta > 0 AND v_order_net + _delta <= 0)
       ) THEN
      RAISE EXCEPTION 'Stock can''t be changed from here' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT id INTO v_variant_id
  FROM public.product_variants
  WHERE id = _variant_id AND product_id = _product_id;

  IF v_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
    SET stock = stock + _delta
    WHERE id = v_variant_id AND stock + _delta >= 0
    RETURNING stock INTO v_resulting;

    IF v_resulting IS NULL THEN
      RAISE EXCEPTION 'Insufficient stock for %', COALESCE(v_product_name, 'this item');
    END IF;

    SELECT COALESCE(SUM(stock), 0) INTO v_variant_sum
    FROM public.product_variants WHERE product_id = _product_id;

    UPDATE public.products SET stock_quantity = v_variant_sum WHERE id = _product_id;
  ELSE
    UPDATE public.products
    SET stock_quantity = stock_quantity + _delta
    WHERE id = _product_id AND stock_quantity + _delta >= 0
    RETURNING stock_quantity INTO v_resulting;

    IF v_resulting IS NULL THEN
      RAISE EXCEPTION 'Insufficient stock for %', COALESCE(v_product_name, 'this item');
    END IF;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, variant_id, vendor_id, change_quantity, resulting_quantity,
    movement_type, reason, reference_order_id, changed_by
  ) VALUES (
    _product_id, v_variant_id, v_vendor_id, _delta, v_resulting,
    _movement_type, _reason, _reference_order_id, auth.uid()
  );

  RETURN jsonb_build_object('resulting_quantity', v_resulting, 'product_name', v_product_name);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_stock(uuid, uuid, integer, text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, integer, text, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Internal helpers: server and cron only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.increment_discount_usage(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_invoice_seq() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_user_ids() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.remind_unconfirmed_orders() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.escalate_overdue_return_requests() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.warehouse_watch() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_discount_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_seq() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_ids() TO service_role;
GRANT EXECUTE ON FUNCTION public.remind_unconfirmed_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.escalate_overdue_return_requests() TO service_role;
GRANT EXECUTE ON FUNCTION public.warehouse_watch() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. abandon_checkout: give back only a counted coupon use
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.abandon_checkout(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  it record;
  v_was_open boolean;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.payment_status IN ('paid', 'refunded') THEN
    RETURN false;
  END IF;
  v_was_open := o.order_status <> 'cancelled';

  -- app.vendor_order_fee_calc lets this status change through
  -- protect_vendor_order_payout_fields in a shopper's own session
  -- (cancel_pending_order); without it the cancel failed there.
  PERFORM set_config('app.unpaid_checkout_release', 'on', true);
  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  UPDATE public.vendor_orders SET status = 'cancelled' WHERE order_id = o.id AND status <> 'cancelled';
  PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
  UPDATE public.orders
  SET order_status = 'cancelled',
      payment_status = CASE WHEN payment_method <> 'cod' AND payment_status = 'pending' THEN 'failed' ELSE payment_status END
  WHERE id = o.id;
  UPDATE public.payments SET payment_status = 'failed' WHERE order_id = o.id AND payment_status = 'pending' AND o.payment_method <> 'cod';
  PERFORM set_config('app.unpaid_checkout_release', 'off', true);

  -- Whatever stock the checkout took and nothing has given back yet.
  FOR it IN
    SELECT product_id, variant_id, sum(change_quantity) AS net
    FROM public.stock_movements WHERE reference_order_id = o.id
    GROUP BY product_id, variant_id HAVING sum(change_quantity) < 0
  LOOP
    PERFORM public.adjust_stock(it.product_id, it.variant_id, (-it.net)::integer, 'return',
      'Payment not completed - stock released', o.id);
  END LOOP;

  -- The part the wallet was going to pay goes straight back.
  IF o.wallet_amount > 0 AND o.user_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (user_id, amount, kind, order_id, note, source_key)
    VALUES (o.user_id, o.wallet_amount, 'order_payment_released', o.id,
            'Payment not completed - wallet balance returned', 'order_payment_released:' || o.id)
    ON CONFLICT (source_key) DO NOTHING;
  END IF;

  -- price_order counted the coupon's use when it gave the order a discount.
  IF v_was_open AND o.discount_code IS NOT NULL AND coalesce(o.discount_amount, 0) > 0 THEN
    UPDATE public.discounts SET used_count = used_count - 1
    WHERE upper(code) = upper(o.discount_code) AND used_count > 0;
  END IF;

  DELETE FROM public.notifications n
  WHERE n.type = 'new_order'
    AND EXISTS (SELECT 1 FROM public.vendor_orders vo WHERE vo.order_id = o.id AND n.link_url LIKE '%' || vo.id::text || '%');

  RETURN v_was_open;
END;
$$;
