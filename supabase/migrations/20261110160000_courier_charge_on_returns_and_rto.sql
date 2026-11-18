-- The courier & logistics charge (Rs 500 + GST a piece) is the boutique's
-- on every piece that left it, also when the piece is returned or comes back
-- undelivered (client, 10 Nov 2026). And a returned piece is no longer the
-- boutique's sale: until now a completed return didn't touch the boutique's
-- payout, so it was paid for goods the customer got their money back for.
--
-- * A piece returned (return completed = refund done) drops out of the
--   part's goods, commission, technology fee, gateway fee, TCS and TDS; its
--   courier charge stays.
-- * A part cancelled or back undelivered (RTO) after it left the boutique
--   (in transit to / at the warehouse, failed the check, shipped...) keeps
--   the charge (vendor_orders.logistics_kept): its net_payable is minus the
--   charge + GST, owed by the boutique. Cancelled before it went out: no
--   charge.
-- * Money owed (below 0) is netted in the boutique's payout batch; a batch
--   that would be 0 or below isn't made - it waits for the next payout.
-- * Fee invoices wait until a part is settled (no open return, cash in),
--   so their fees are final; a boutique may get more than one a day.
-- * statement_lines: product_value / TCS are after returns (as deducted
--   from the payout now); new last column returned_value (taxable value of
--   returned pieces) for GSTR-8; the charge shows on cancelled-after-shipping
--   parts.

ALTER TABLE public.vendor_orders ADD COLUMN IF NOT EXISTS logistics_kept boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.vendor_orders.logistics_kept IS
  'Cancelled / back undelivered after leaving the boutique: the courier & logistics charge stays (owed)';

-- Pieces of an order line returned with the refund done.
CREATE OR REPLACE FUNCTION public.returned_quantity(_order_item_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(coalesce((e->>'quantity')::integer, oi.quantity)), 0)::integer
  FROM public.order_items oi
  JOIN public.return_requests rr ON rr.order_id = oi.order_id
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(rr.items, '[]'::jsonb)) e
  WHERE oi.id = _order_item_id
    AND rr.request_type = 'return' AND rr.status = 'completed'
    AND e->>'order_item_id' = _order_item_id::text;
$$;
REVOKE ALL ON FUNCTION public.returned_quantity(uuid) FROM public, anon;

-- As 20261110140000_courier_charge_to_boutique, plus logistics_kept.
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


-- As 20261110140000_courier_charge_to_boutique, except: returned pieces and
-- cancelled / undelivered parts sell nothing; the courier charge is on every
-- piece that left the boutique.
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
  v_pieces integer := 0;
  v_kept integer;
  v_gone boolean;
  v_hsn_missing boolean := false;
  v_commission_pct numeric;
  v_commission numeric;
  v_tech numeric;
  v_logistics numeric;
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

  -- A part cancelled or back undelivered sells nothing; a returned piece
  -- (refund done) is no longer sold either.
  v_gone := vo.status IN ('cancelled', 'returned');
  FOR it IN
    SELECT oi.id, oi.price, oi.quantity, oi.discount_amount, c.hsn_code_id
    FROM order_items oi
    LEFT JOIN products p ON p.id::text = oi.product_id::text
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE oi.vendor_order_id = vo.id
  LOOP
    v_kept := CASE WHEN v_gone THEN 0 ELSE greatest(it.quantity - public.returned_quantity(it.id), 0) END;
    v_gross := it.price * v_kept;
    -- The coupon share checkout recorded for this line (only the lines the
    -- coupon covered have one); orders from before that share it by value.
    -- Only the kept pieces' share.
    v_disc := round(coalesce(it.discount_amount,
      CASE WHEN coalesce(o.subtotal, 0) > 0 THEN round(coalesce(o.discount_amount, 0) * it.price * it.quantity / o.subtotal, 2) ELSE 0 END)
      * v_kept / greatest(it.quantity, 1), 2);
    v_net := v_gross - v_disc;
    v_rate := gst_rate_for(it.hsn_code_id, v_net / greatest(v_kept, 1));
    IF v_rate IS NULL THEN
      v_hsn_missing := true;
      v_rate := 0;
    END IF;
    v_taxable := round(v_net / (1 + v_rate / 100), 2);
    v_goods := v_goods + v_net;
    v_product := v_product + v_taxable;
    v_gst := v_gst + (v_net - v_taxable);
    -- Courier & logistics: every piece that left the boutique - returned
    -- or back undelivered too (client, 10 Nov 2026); none when the part was
    -- cancelled before it went out.
    v_pieces := v_pieces + CASE WHEN v_gone AND NOT vo.logistics_kept THEN 0 ELSE coalesce(it.quantity, 0) END;
  END LOOP;

  v_commission_pct := effective_commission_pct(vo.vendor_id, coalesce(o.created_at, now()));
  v_commission := round(v_product * v_commission_pct / 100, 2);
  v_tech := round(v_product * r.technology_fee_pct / 100, 2);
  -- Courier & logistics: a fixed charge per piece (client, 10 Nov 2026).
  v_logistics := round(v_pieces * coalesce(r.logistics_fee_per_piece, 0), 2);
  v_fee_gst := round((v_commission + v_tech + v_logistics) * r.fee_gst_pct / 100, 2);

  -- Courier: when AllBoutiqs bears it, the customer's shipping charge is
  -- AllBoutiqs' too; when charged to the boutique, the boutique gets the
  -- shipping charge and pays the courier cost (filled in once booked).
  v_ship_to_boutique := r.charge_courier_to_boutique;
  v_shipping_credit := CASE WHEN v_ship_to_boutique THEN coalesce(vo.shipping_cost, 0) ELSE 0 END;
  v_courier := CASE WHEN v_ship_to_boutique THEN coalesce(vo.courier_charge, 0) ELSE 0 END;

  -- Only the part paid online carries the gateway fee - not what the
  -- customer paid from their wallet (no gateway took that).
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
    logistics_fee_rate = coalesce(r.logistics_fee_per_piece, 0),
    logistics_fee_amount = v_logistics,
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
    net_payable = round(v_goods + v_shipping_credit - v_commission - v_tech - v_logistics - v_fee_gst - v_gateway
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


-- A part cancelled or back undelivered after it left the boutique keeps the
-- courier charge, due now. Runs after the money-field guard (a_...).
CREATE OR REPLACE FUNCTION public.keep_courier_charge_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'returned') AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status IN ('in_transit_to_warehouse', 'at_warehouse', 'qc_failed', 'shipped', 'out_for_delivery',
                        'ndr', 'delivered', 'returned') THEN
    NEW.logistics_kept := true;
    NEW.payout_eligible_on := coalesce(NEW.payout_eligible_on, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_keep_courier_charge_on_cancel ON public.vendor_orders;
CREATE TRIGGER zz_keep_courier_charge_on_cancel
  BEFORE UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.keep_courier_charge_on_cancel();

-- Fees again when a part is cancelled / comes back, or a return completes.
CREATE OR REPLACE FUNCTION public.recompute_fees_on_part_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.compute_vendor_order_fees(NEW.id);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS recompute_fees_on_part_status ON public.vendor_orders;
CREATE TRIGGER recompute_fees_on_part_status
  AFTER UPDATE OF status ON public.vendor_orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('cancelled', 'returned'))
  EXECUTE FUNCTION public.recompute_fees_on_part_status();

CREATE OR REPLACE FUNCTION public.recompute_fees_on_return_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT oi.vendor_order_id
    FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) e
    JOIN public.order_items oi ON oi.id::text = e->>'order_item_id'
    WHERE oi.vendor_order_id IS NOT NULL
  LOOP
    PERFORM public.compute_vendor_order_fees(r.vendor_order_id);
  END LOOP;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS recompute_fees_on_return_completed ON public.return_requests;
CREATE TRIGGER recompute_fees_on_return_completed
  AFTER UPDATE OF status ON public.return_requests
  FOR EACH ROW WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.request_type = 'return')
  EXECUTE FUNCTION public.recompute_fees_on_return_completed();

-- As 20261110100000_return_window_hours, plus charges owed (below 0).
CREATE OR REPLACE FUNCTION public.vendor_order_payout_blocker(_vendor_order_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vo public.vendor_orders;
  o public.orders;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT * INTO vo FROM public.vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF vo.rzp_transfer_status = 'released'
     OR EXISTS (SELECT 1 FROM public.vendor_payouts p WHERE p.id = vo.payout_id AND p.status IN ('processing', 'paid')) THEN
    RETURN 'paid';
  END IF;
  -- Cancelled or back undelivered after it left the boutique: the courier
  -- & logistics charge is owed (net_payable below 0) and is taken off the
  -- boutique's next payout.
  IF vo.status IN ('cancelled', 'returned') THEN
    IF NOT vo.logistics_kept THEN RETURN 'not_delivered'; END IF;
    IF coalesce(vo.net_payable, 0) = 0 THEN RETURN 'nothing_to_pay'; END IF;
    IF vo.payout_eligible_on IS NULL OR vo.payout_eligible_on > v_today THEN RETURN 'not_due'; END IF;
    RETURN NULL;
  END IF;
  IF vo.status IS DISTINCT FROM 'delivered' THEN RETURN 'not_delivered'; END IF;

  IF public.vendor_order_window_end_at(vo.id, vo.delivered_at, vo.return_window_ends_at, vo.return_window_ends_on) > now() THEN
    RETURN 'return_window_open';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.return_requests rr
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(rr.items, '[]'::jsonb)) e
    JOIN public.order_items oi ON oi.id::text = e->>'order_item_id'
    WHERE rr.order_id = vo.order_id AND oi.vendor_order_id = vo.id
      AND rr.status NOT IN ('rejected', 'completed', 'cancelled')
  ) THEN
    RETURN 'open_return';
  END IF;

  IF vo.payout_eligible_on IS NULL OR vo.payout_eligible_on > v_today THEN RETURN 'not_due'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = vo.order_id;
  IF o.payment_method = 'cod' THEN
    IF vo.cod_received_at IS NULL AND o.payment_status IS DISTINCT FROM 'paid' THEN RETURN 'cod_cash_pending'; END IF;
  ELSIF o.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN 'payment_pending';
  END IF;

  -- Below 0 (every piece returned: only the courier charge left) is owed
  -- and netted in the boutique's payout.
  IF coalesce(vo.net_payable, 0) - coalesce(vo.rzp_reversed_amount, 0) = 0 THEN RETURN 'nothing_to_pay'; END IF;
  RETURN NULL;
END;
$$;



-- As 20261016110000_razorpayx_payouts, plus charges owed: netted in the
-- batch; no batch at 0 or below.
CREATE OR REPLACE FUNCTION public.prepare_vendor_payouts(_payout_date date DEFAULT NULL)
RETURNS TABLE (vendor_id uuid, vendor_name text, payout_id uuid, order_count integer, net_payable numeric, skipped_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := coalesce(_payout_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  r record;
  v_payout uuid;
  v_status text;
  v_has_account boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only AllBoutiqs admins can prepare payouts';
  END IF;

  FOR r IN
    SELECT vo.vendor_id AS vid, v.name AS vname, array_agg(vo.id) AS ids,
           sum(vo.net_payable - coalesce(vo.rzp_reversed_amount, 0)) AS amount,
           sum(CASE WHEN vo.status = 'delivered' THEN vo.subtotal + coalesce(vo.shipping_cost, 0) ELSE 0 END) AS gross,
           sum(vo.commission_amount) AS commission,
           min((vo.delivered_at AT TIME ZONE 'Asia/Kolkata')::date) AS first_day
    FROM public.vendor_orders vo
    JOIN public.vendors v ON v.id = vo.vendor_id
    WHERE vo.payout_id IS NULL
      AND (vo.status = 'delivered' OR (vo.status IN ('cancelled', 'returned') AND vo.logistics_kept))
      AND vo.rzp_transfer_status IS DISTINCT FROM 'released'
      AND public.vendor_order_payout_blocker(vo.id) IS NULL
    GROUP BY vo.vendor_id, v.name
  LOOP
    -- Only charges owed (or they cancel out): nothing to send - they wait
    -- and come off the boutique's next payout.
    IF coalesce(r.amount, 0) <= 0 THEN
      vendor_id := r.vid; vendor_name := r.vname; payout_id := NULL; order_count := array_length(r.ids, 1);
      net_payable := r.amount; skipped_reason := 'owes AllBoutiqs - taken off the next payout';
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT payout_account_status INTO v_status FROM public.vendors WHERE id = r.vid;
    v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts a WHERE a.vendor_id = r.vid);
    IF NOT v_has_account OR v_status IN ('not_setup', 'needs_update', 'disabled') THEN
      vendor_id := r.vid; vendor_name := r.vname; payout_id := NULL; order_count := array_length(r.ids, 1);
      net_payable := r.amount;
      skipped_reason := CASE WHEN v_status = 'disabled' THEN 'payouts disabled'
                             WHEN v_status = 'needs_update' THEN 'bank details need updating'
                             ELSE 'no payout bank account' END;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT p.id INTO v_payout FROM public.vendor_payouts p
    WHERE p.vendor_id = r.vid AND p.status = 'pending' AND p.payout_date = v_day
    LIMIT 1;
    IF v_payout IS NULL THEN
      INSERT INTO public.vendor_payouts (vendor_id, period_start, period_end, payout_date, gross_sales, commission_amount,
                                         net_payable, order_count, vendor_order_ids)
      VALUES (r.vid, coalesce(r.first_day, v_day), v_day, v_day, r.gross, r.commission, r.amount, array_length(r.ids, 1), r.ids)
      RETURNING id INTO v_payout;
    ELSE
      UPDATE public.vendor_payouts p SET
        gross_sales = p.gross_sales + r.gross,
        commission_amount = p.commission_amount + r.commission,
        net_payable = p.net_payable + r.amount,
        order_count = p.order_count + array_length(r.ids, 1),
        vendor_order_ids = p.vendor_order_ids || r.ids,
        period_start = least(p.period_start, coalesce(r.first_day, v_day))
      WHERE p.id = v_payout;
    END IF;

    PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
    UPDATE public.vendor_orders SET payout_id = v_payout WHERE id = ANY (r.ids);
    PERFORM set_config('app.vendor_order_fee_calc', 'off', true);

    vendor_id := r.vid; vendor_name := r.vname; payout_id := v_payout; order_count := array_length(r.ids, 1);
    net_payable := r.amount; skipped_reason := NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;


-- As 20261016110000_razorpayx_payouts, plus: a batch left at 0 or below is
-- dropped (its charges wait for the next payout).
CREATE OR REPLACE FUNCTION public.recheck_vendor_payout(_payout_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.vendor_payouts;
  v_drop uuid[];
  v_keep uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only AllBoutiqs admins can send payouts';
  END IF;
  SELECT * INTO p FROM public.vendor_payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'pending' THEN RETURN 0; END IF;

  SELECT array_agg(id) FILTER (WHERE public.vendor_order_payout_blocker(id) IS NOT NULL),
         array_agg(id) FILTER (WHERE public.vendor_order_payout_blocker(id) IS NULL)
  INTO v_drop, v_keep
  FROM public.vendor_orders WHERE payout_id = _payout_id;

  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  IF v_drop IS NOT NULL THEN
    UPDATE public.vendor_orders SET payout_id = NULL WHERE id = ANY (v_drop);
  END IF;
  PERFORM set_config('app.vendor_order_fee_calc', 'off', true);

  -- Nothing left to send - or only charges the boutique owes: they wait
  -- for its next payout.
  IF v_keep IS NULL
     OR (SELECT sum(net_payable - coalesce(rzp_reversed_amount, 0)) FROM public.vendor_orders WHERE id = ANY (v_keep)) <= 0 THEN
    PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
    UPDATE public.vendor_orders SET payout_id = NULL WHERE payout_id = _payout_id;
    PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
    DELETE FROM public.vendor_payouts WHERE id = _payout_id;
    RETURN 0;
  END IF;

  UPDATE public.vendor_payouts x SET
    order_count = array_length(v_keep, 1),
    vendor_order_ids = v_keep,
    gross_sales = (SELECT sum(CASE WHEN status = 'delivered' THEN subtotal + coalesce(shipping_cost, 0) ELSE 0 END)
                   FROM public.vendor_orders WHERE id = ANY (v_keep)),
    commission_amount = (SELECT sum(commission_amount) FROM public.vendor_orders WHERE id = ANY (v_keep)),
    net_payable = (SELECT sum(net_payable - coalesce(rzp_reversed_amount, 0)) FROM public.vendor_orders WHERE id = ANY (v_keep))
  WHERE x.id = _payout_id
  RETURNING x.net_payable INTO p.net_payable;
  RETURN p.net_payable;
END;
$$;


-- Fee invoices only for settled parts, so a boutique can get more than one
-- for the same payout date.
ALTER TABLE public.fee_invoices DROP CONSTRAINT IF EXISTS fee_invoices_vendor_id_payout_date_key;

-- As 20261110140000_courier_charge_to_boutique, except: settled parts only,
-- and cancelled / undelivered parts with the courier charge kept.
CREATE OR REPLACE FUNCTION public.generate_fee_invoices(_upto date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upto date := coalesce(_upto, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  b record;
  v_vendor record;
  v_gstin text;
  v_state text;
  v_intra boolean;
  v_taxable numeric;
  v_tax numeric;
  v_id uuid;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can issue fee invoices';
  END IF;

  FOR b IN
    SELECT vo.vendor_id, vo.payout_eligible_on AS payout_date,
           array_agg(vo.id ORDER BY vo.delivered_at) AS ids, count(*) AS n,
           min((vo.delivered_at AT TIME ZONE 'Asia/Kolkata')::date) AS first_day,
           max((vo.delivered_at AT TIME ZONE 'Asia/Kolkata')::date) AS last_day,
           sum(vo.product_value) AS product_value, sum(vo.commission_amount) AS commission,
           sum(vo.tech_fee_amount) AS tech_fee, sum(vo.logistics_fee_amount) AS logistics,
           max(vo.fee_gst_rate) AS gst_rate,
           bool_or(vo.commission_rate = 0) AS waived
    FROM vendor_orders vo
    WHERE (vo.status = 'delivered' OR (vo.status IN ('cancelled', 'returned') AND vo.logistics_kept))
      AND vo.fee_invoice_id IS NULL
      AND vo.payout_eligible_on IS NOT NULL AND vo.payout_eligible_on <= v_upto
      -- Settled first: no open return, cash in - its fees are final.
      AND (vo.payout_id IS NOT NULL OR public.vendor_order_payout_blocker(vo.id) IS NULL)
    GROUP BY vo.vendor_id, vo.payout_eligible_on
  LOOP
    v_taxable := round(coalesce(b.commission, 0) + coalesce(b.tech_fee, 0) + coalesce(b.logistics, 0), 2);
    IF v_taxable <= 0 THEN CONTINUE; END IF;

    SELECT v.name, v.address, v.pan_number, v.gst_number, k.legal_business_name, k.gstin, k.pan
    INTO v_vendor
    FROM vendors v LEFT JOIN vendor_kyc k ON k.vendor_id = v.id WHERE v.id = b.vendor_id;
    v_gstin := coalesce(v_vendor.gstin, v_vendor.gst_number);
    v_state := coalesce(left(v_gstin, 2), gst_state_code(v_vendor.address->>'state'));
    v_intra := v_state = '24';
    v_tax := round(v_taxable * coalesce(b.gst_rate, 18) / 100, 2);

    INSERT INTO fee_invoices (
      invoice_number, vendor_id, payout_date, period_start, period_end,
      supplier_name, supplier_gstin, supplier_cin, supplier_state_code,
      recipient_name, recipient_legal_name, recipient_gstin, recipient_pan, recipient_address, recipient_state_code,
      supply_type, sac_code, order_count, product_value, commission_amount, tech_fee_amount,
      logistics_fee_amount, logistics_sac_code, taxable_value,
      gst_rate, cgst_amount, sgst_amount, igst_amount, total, founding_waiver, vendor_order_ids
    ) VALUES (
      next_fee_invoice_number(now()), b.vendor_id, b.payout_date, b.first_day, b.last_day,
      'AllBoutiqs Private Limited', '24ABGCA7307J1ZP', 'U47912GJ2026PTC183684', '24',
      v_vendor.name, coalesce(v_vendor.legal_business_name, v_vendor.name), v_gstin,
      coalesce(v_vendor.pan, v_vendor.pan_number), v_vendor.address, v_state,
      CASE WHEN v_intra THEN 'intra_state' ELSE 'inter_state' END,
      (rates_on(now())).fee_sac_code, b.n, round(b.product_value, 2), round(b.commission, 2), round(b.tech_fee, 2),
      round(coalesce(b.logistics, 0), 2), (rates_on(now())).logistics_sac_code, v_taxable,
      coalesce(b.gst_rate, 18),
      CASE WHEN v_intra THEN round(v_tax / 2, 2) ELSE 0 END,
      CASE WHEN v_intra THEN v_tax - round(v_tax / 2, 2) ELSE 0 END,
      CASE WHEN v_intra THEN 0 ELSE v_tax END,
      v_taxable + v_tax, coalesce(b.waived, false), b.ids
    )
    RETURNING id INTO v_id;

    UPDATE vendor_orders SET fee_invoice_id = v_id WHERE id = ANY (b.ids);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;


-- As 20261110140000_courier_charge_to_boutique, plus returned_value (new
-- last column); product_value and TCS after returns; the courier charge on
-- cancelled-after-shipping parts.
DROP FUNCTION IF EXISTS public.statement_lines(uuid, date, date);
CREATE OR REPLACE FUNCTION public.statement_lines(_vendor_id uuid, _from date, _to date)
 RETURNS TABLE(vendor_id uuid, boutique_code text, boutique_name text, vendor_order_id uuid, order_number text, order_date date, delivered_on date, status text, payment_method text, supply_type text, goods_value numeric, product_value numeric, gst numeric, commission numeric, tech_fee numeric, fee_gst numeric, gateway_fee numeric, courier numeric, cod_charge numeric, refunded numeric, net_taxable numeric, tcs_rate numeric, tcs_cgst numeric, tcs_sgst numeric, tcs_igst numeric, tds_rate numeric, tds numeric, net_payout numeric, payout_status text, payment_date date, utr text, fee_invoice_number text, discount numeric, shipping_credit numeric, returned_value numeric)
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
           -- Taxable value of the pieces returned (refund done) - already
           -- out of product_value; shown for GSTR-8's "returns".
           (SELECT coalesce(round(sum(rq.qty * (oi.price - coalesce(oi.discount_amount, 0) / greatest(oi.quantity, 1))
                     / (1 + coalesce(gst_rate_for(c.hsn_code_id, oi.price - coalesce(oi.discount_amount, 0) / greatest(oi.quantity, 1)), 0) / 100)), 2), 0)
              FROM order_items oi
              LEFT JOIN products p ON p.id::text = oi.product_id::text
              LEFT JOIN categories c ON c.id = p.category_id
              CROSS JOIN LATERAL (SELECT least(public.returned_quantity(oi.id), oi.quantity) AS qty) rq
              WHERE oi.vendor_order_id = vo.id) AS returned_taxable
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
    SELECT r.id AS refund_id, r.amount, oi.vendor_order_id AS vo_id,
           oi.price * coalesce((elem->>'quantity')::int, oi.quantity) AS item_value
    FROM refunds r
    JOIN return_requests rr ON rr.id = r.return_request_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(rr.items, '[]'::jsonb)) AS elem
    JOIN order_items oi ON oi.id = (elem->>'order_item_id')::uuid
    WHERE r.status = 'processed' AND oi.vendor_order_id IN (SELECT id FROM base)
  ),
  return_refunds AS (
    SELECT ri.vo_id, sum(ri.amount * ri.item_value / nullif(t.total_value, 0)) AS amt
    FROM return_items ri
    JOIN (SELECT refund_id, sum(item_value) AS total_value FROM return_items GROUP BY refund_id) t ON t.refund_id = ri.refund_id
    GROUP BY ri.vo_id
  ),
  calc AS (
    SELECT b.*,
           round(coalesce(cr.amt, 0) + coalesce(rf.amt, 0), 2) AS refunded_amt,
           (b.status IN ('cancelled', 'returned')) AS is_cancelled
    FROM base b
    LEFT JOIN cancel_refunds cr ON cr.vo_id = b.id
    LEFT JOIN return_refunds rf ON rf.vo_id = b.id
  ),
  taxed AS (
    -- product_value is already after returned pieces (and 0 when cancelled).
    SELECT c.*, CASE WHEN c.is_cancelled THEN 0 ELSE c.product_value END AS net_tax
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
         CASE WHEN t.is_cancelled AND NOT t.logistics_kept THEN 0 ELSE t.fee_gst_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.gateway_fee_amount END,
         t.courier_charge + CASE WHEN t.is_cancelled AND NOT t.logistics_kept THEN 0 ELSE t.logistics_fee_amount END,
         CASE WHEN coalesce(t.customer_cod, 0) > 0 THEN 0 ELSE t.cod_handling_charge END,
         t.refunded_amt, t.net_tax,
         t.tcs_rate,
         CASE WHEN t.supply_type = 'intra_state' THEN round(t.net_tax * t.tcs_rate / 200, 2) ELSE 0 END,
         CASE WHEN t.supply_type = 'intra_state' THEN round(t.net_tax * t.tcs_rate / 100, 2) - round(t.net_tax * t.tcs_rate / 200, 2) ELSE 0 END,
         CASE WHEN t.supply_type = 'intra_state' THEN 0 ELSE round(t.net_tax * t.tcs_rate / 100, 2) END,
         t.tds_rate,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.tds_amount END,
         CASE WHEN t.is_cancelled AND NOT t.logistics_kept THEN 0 ELSE t.net_payable END,
         CASE WHEN coalesce(t.rzp_settled_at, t.manual_paid_at) IS NOT NULL THEN 'paid'
              WHEN t.rzp_transfer_status = 'released' THEN 'sent'
              ELSE 'pending' END,
         (coalesce(t.rzp_settled_at, t.manual_paid_at) AT TIME ZONE 'Asia/Kolkata')::date,
         coalesce(t.rzp_settlement_utr, t.manual_utr),
         t.fee_inv,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.disc_share END,
         CASE WHEN t.is_cancelled OR NOT t.shipping_to_boutique THEN 0 ELSE coalesce(t.shipping_cost, 0) END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.returned_taxable END
  FROM taxed t
  ORDER BY t.order_created, t.bname;
END;
$function$;

REVOKE ALL ON FUNCTION public.statement_lines(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.statement_lines(uuid, date, date) TO authenticated, service_role;

-- Bring unpaid parts up to date (returns already completed, etc.).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.vendor_orders WHERE payout_id IS NULL AND rzp_transfer_id IS NULL LOOP
    PERFORM public.compute_vendor_order_fees(r.id);
  END LOOP;
END;
$$;
