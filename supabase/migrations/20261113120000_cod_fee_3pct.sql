-- Cash on Delivery fee = 3% of the amount due + 18% GST on that fee
-- (testing checklist v1.2, client 13 Nov 2026). It replaces Shiprocket's own
-- COD charge for the parcel (20261025180000_cod_charge_to_customer).
--
-- * Worked out per boutique part (vendor_order): 3% of the part's goods less
--   its coupon share plus its shipping, rounded to the paisa, then 18% GST on
--   that, rounded to the paisa. Stored on the part (cod_fee_amount,
--   cod_fee_gst_amount); the order's cod_charge is the sum of its parts.
-- * Per part, because each part has its own AllBoutiqs invoice and the
--   warehouse sends parts in separate parcels as they arrive: the invoice
--   with a part's goods shows exactly that part's fee and GST, and its parcel
--   collects exactly that. (Until now the whole charge went on the first
--   part's invoice while each parcel collected a share by value.)
-- * AllBoutiqs' invoice for it: taxable value = the 3% fee, GST = 18% of it,
--   SAC 996812, as before.
-- * The rate is platform_settings.cod_fee_pct (3); the GST rate is 18%.
-- * shiprocket-cod-charge still checks a courier collects cash at the PIN
--   code (and records the quote); the fee itself is worked out here, by
--   cod_charge_for, for checkout and for the order alike.
-- * Orders placed before this keep what they had (their parts carry no fee;
--   their charge stays on the first AllBoutiqs invoice).

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS cod_fee_pct numeric(5,2) NOT NULL DEFAULT 3
    CHECK (cod_fee_pct BETWEEN 0 AND 20);

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS cod_fee_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (cod_fee_amount >= 0),
  ADD COLUMN IF NOT EXISTS cod_fee_gst_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (cod_fee_gst_amount >= 0);
COMMENT ON COLUMN public.vendor_orders.cod_fee_amount IS
  'Cash on Delivery fee the customer pays AllBoutiqs for this part, before GST (platform_settings.cod_fee_pct of the part''s amount due).';
COMMENT ON COLUMN public.vendor_orders.cod_fee_gst_amount IS
  '18% GST on cod_fee_amount.';

-- ---------------------------------------------------------------------------
-- The fee for an amount due, and for an order's parts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cod_fee_of(_amount numeric)
RETURNS TABLE(fee numeric, gst numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.fee, round(x.fee * 18 / 100, 2)
  FROM (
    SELECT round(greatest(coalesce(_amount, 0), 0)
                 * coalesce((SELECT ps.cod_fee_pct FROM public.platform_settings ps WHERE ps.id), 3) / 100, 2) AS fee
  ) x;
$$;

-- Checkout's quote (shiprocket-cod-charge): one amount due per boutique part.
CREATE OR REPLACE FUNCTION public.cod_charge_for(_amounts numeric[])
RETURNS TABLE(fee numeric, gst numeric, total numeric, fee_pct numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(f.fee), 0), coalesce(sum(f.gst), 0), coalesce(sum(f.fee + f.gst), 0),
         coalesce((SELECT ps.cod_fee_pct FROM public.platform_settings ps WHERE ps.id), 3)
  FROM unnest(coalesce(_amounts, '{}'::numeric[])) AS a(amount)
  CROSS JOIN LATERAL public.cod_fee_of(a.amount) f;
$$;

REVOKE ALL ON FUNCTION public.cod_fee_of(numeric) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.cod_charge_for(numeric[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cod_fee_of(numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.cod_charge_for(numeric[]) TO service_role;

-- ---------------------------------------------------------------------------
-- price_order: as 20261103150000_server_side_order_prices, with the COD fee
-- worked out per part instead of taken from Shiprocket's quote
-- ---------------------------------------------------------------------------

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
      RAISE EXCEPTION 'The coupon % needs a minimum order of Rs %.', o.discount_code, d.min_order_amount
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

REVOKE ALL ON FUNCTION public.price_order(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- AllBoutiqs' invoice to the customer: as 20261110150000, with a part's own
-- COD fee (taxable value = the fee, GST = its 18%) when the order has them
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_platform_invoice(_vendor_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vo public.vendor_orders;
  o public.orders;
  v_id uuid;
  v_rate numeric := 18;
  v_shipping numeric;
  v_cod numeric;
  v_cod_fee numeric;
  v_total numeric;
  v_taxable numeric;
  v_tax numeric;
  v_pos text;
  v_intra boolean;
BEGIN
  SELECT id INTO v_id FROM platform_invoices WHERE vendor_order_id = _vendor_order_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT * INTO vo FROM vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO o FROM orders WHERE id = vo.order_id;
  v_shipping := CASE WHEN coalesce(vo.shipping_to_boutique, false) THEN 0 ELSE coalesce(vo.shipping_cost, 0) END;

  IF EXISTS (SELECT 1 FROM vendor_orders x WHERE x.order_id = o.id
             AND (x.cod_fee_amount > 0 OR x.cod_fee_gst_amount > 0)) THEN
    -- This part's own COD fee.
    v_cod_fee := vo.cod_fee_amount;
    v_cod := vo.cod_fee_amount + vo.cod_fee_gst_amount;
  ELSE
    -- Orders from before 13 Nov 2026: the order's whole COD charge, on its
    -- first AllBoutiqs invoice.
    v_cod_fee := NULL;
    v_cod := CASE WHEN EXISTS (SELECT 1 FROM platform_invoices WHERE order_id = o.id AND cod_amount > 0) THEN 0
                  ELSE coalesce(o.cod_charge, 0) END;
  END IF;
  v_total := round(v_shipping + v_cod, 2);
  IF v_total <= 0 THEN RETURN NULL; END IF;

  v_pos := gst_state_code(o.shipping_address->>'state');
  v_intra := v_pos = '24';
  v_taxable := CASE WHEN v_cod_fee IS NOT NULL
    THEN round(v_shipping / (1 + v_rate / 100), 2) + v_cod_fee
    ELSE round(v_total / (1 + v_rate / 100), 2) END;
  v_tax := v_total - v_taxable;

  INSERT INTO platform_invoices (
    invoice_number, order_id, vendor_order_id, goods_invoice_id, issued_at,
    supplier_name, supplier_gstin, supplier_state_code,
    billing_name, billing_address, billing_state, place_of_supply_code, supply_type,
    sac_code, gst_rate, shipping_amount, cod_amount,
    taxable_value, cgst_amount, sgst_amount, igst_amount, total
  ) VALUES (
    next_platform_invoice_number(now()), o.id, vo.id,
    (SELECT i.id FROM invoices i WHERE i.vendor_order_id = vo.id), now(),
    'AllBoutiqs Private Limited', '24ABGCA7307J1ZP', '24',
    o.customer_name, o.shipping_address,
    (SELECT s.name FROM indian_states s WHERE s.gst_code = v_pos), v_pos,
    CASE WHEN v_intra THEN 'intra_state' ELSE 'inter_state' END,
    '996812', v_rate, v_shipping, v_cod,
    v_taxable,
    CASE WHEN v_intra THEN round(v_tax / 2, 2) ELSE 0 END,
    CASE WHEN v_intra THEN v_tax - round(v_tax / 2, 2) ELSE 0 END,
    CASE WHEN v_intra THEN 0 ELSE v_tax END,
    v_total
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_platform_invoice(uuid) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A part's COD fee is the server's, like its other amounts: as
-- 20261110160000_courier_charge_on_returns_and_rto, plus the two new columns
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_vendor_order_payout_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() OR current_setting('app.vendor_order_fee_calc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  -- Delivery now releases real money automatically, so order status may
  -- only change through the courier webhook / server functions / admins -
  -- never directly from a boutique's session (no app screen does this).
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Order status is updated by the courier and AllBoutiqs, not directly';
  END IF;
  NEW.payout_id := OLD.payout_id;
  NEW.payout_eligible_on := OLD.payout_eligible_on;
  NEW.delivered_at := OLD.delivered_at;
  NEW.due_notified_at := OLD.due_notified_at;
  NEW.payout_notified_at := OLD.payout_notified_at;
  NEW.rzp_transfer_id := OLD.rzp_transfer_id;
  NEW.rzp_transfer_kind := OLD.rzp_transfer_kind;
  NEW.rzp_transfer_status := OLD.rzp_transfer_status;
  NEW.rzp_transfer_amount := OLD.rzp_transfer_amount;
  NEW.rzp_reversed_amount := OLD.rzp_reversed_amount;
  NEW.rzp_transfer_error := OLD.rzp_transfer_error;
  NEW.rzp_released_at := OLD.rzp_released_at;
  NEW.rzp_settlement_id := OLD.rzp_settlement_id;
  NEW.rzp_settlement_utr := OLD.rzp_settlement_utr;
  NEW.rzp_settled_at := OLD.rzp_settled_at;
  NEW.subtotal := OLD.subtotal;
  NEW.shipping_cost := OLD.shipping_cost;
  NEW.net_payable := OLD.net_payable;
  NEW.commission_rate := OLD.commission_rate;
  NEW.commission_amount := OLD.commission_amount;
  NEW.rates_effective_from := OLD.rates_effective_from;
  NEW.goods_value := OLD.goods_value;
  NEW.product_value := OLD.product_value;
  NEW.goods_gst := OLD.goods_gst;
  NEW.supply_type := OLD.supply_type;
  NEW.tech_fee_rate := OLD.tech_fee_rate;
  NEW.tech_fee_amount := OLD.tech_fee_amount;
  NEW.fee_gst_rate := OLD.fee_gst_rate;
  NEW.fee_gst_amount := OLD.fee_gst_amount;
  NEW.gateway_fee_rate := OLD.gateway_fee_rate;
  NEW.gateway_fee_amount := OLD.gateway_fee_amount;
  NEW.shipping_to_boutique := OLD.shipping_to_boutique;
  NEW.courier_charge := OLD.courier_charge;
  NEW.cod_handling_charge := OLD.cod_handling_charge;
  NEW.cod_fee_amount := OLD.cod_fee_amount;
  NEW.cod_fee_gst_amount := OLD.cod_fee_gst_amount;
  NEW.logistics_fee_rate := OLD.logistics_fee_rate;
  NEW.logistics_fee_amount := OLD.logistics_fee_amount;
  NEW.logistics_kept := OLD.logistics_kept;
  NEW.tcs_rate := OLD.tcs_rate;
  NEW.tcs_amount := OLD.tcs_amount;
  NEW.tds_rate := OLD.tds_rate;
  NEW.tds_amount := OLD.tds_amount;
  NEW.hsn_missing := OLD.hsn_missing;
  NEW.fees_computed_at := OLD.fees_computed_at;
  NEW.fee_invoice_id := OLD.fee_invoice_id;
  NEW.cod_received_at := OLD.cod_received_at;
  NEW.cod_received_utr := OLD.cod_received_utr;
  NEW.cod_received_source := OLD.cod_received_source;
  RETURN NEW;
END;
$$;
