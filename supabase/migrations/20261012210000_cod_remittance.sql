-- Cash on Delivery money tracking (step 12). The courier collects the cash,
-- Shiprocket remits it to AllBoutiqs' bank, AllBoutiqs pays the boutique:
--   Collected -> Received by AllBoutiqs -> Paid to boutique.
-- shiprocket-cod-sync reads each COD parcel from Shiprocket (its COD charge
-- and remittance status / UTR / date) into shipments, then
-- apply_shipment_cod() shares the COD charge between the boutique orders in
-- the parcel (it comes off their payout) and marks their cash received.
-- Admins can also mark cash received by hand (UTR + date), e.g. when
-- Shiprocket's data is late. A COD order is paid out only once its cash has
-- been received, on the next weekly payout day after that.

ALTER TABLE public.shipments
  -- Cash the courier collects on this parcel (Shiprocket's order total)
  ADD COLUMN IF NOT EXISTS cod_amount numeric(12,2),
  -- Shiprocket's COD charge on this parcel
  ADD COLUMN IF NOT EXISTS cod_charge numeric(12,2),
  ADD COLUMN IF NOT EXISTS cod_remittance_status text,
  ADD COLUMN IF NOT EXISTS cod_remittance_utr text,
  ADD COLUMN IF NOT EXISTS cod_remitted_on date,
  ADD COLUMN IF NOT EXISTS cod_synced_at timestamptz;

ALTER TABLE public.vendor_orders
  -- When this boutique order's COD cash reached AllBoutiqs
  ADD COLUMN IF NOT EXISTS cod_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS cod_received_utr text,
  ADD COLUMN IF NOT EXISTS cod_received_source text CHECK (cod_received_source IN ('shiprocket', 'manual'));

-- Boutiques can't mark their own cash received (or unlink a fee invoice).
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

-- Payout date: as in step 9, plus - for cash on delivery - not before the
-- courier's cash has reached AllBoutiqs (until then the date is the
-- earliest it could be).
CREATE OR REPLACE FUNCTION public.vendor_order_payout_date(_vendor_order_id uuid, _delivered_at timestamptz)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_rates := public.rates_on(now());
  v_order_id uuid;
  v_cod_at timestamptz;
  v_method text;
  v_paid_at timestamptz;
  v_settle integer;
  v_hold_days integer;
  v_ready timestamptz;
BEGIN
  SELECT order_id, cod_received_at INTO v_order_id, v_cod_at FROM public.vendor_orders WHERE id = _vendor_order_id;
  SELECT payment_method INTO v_method FROM public.orders WHERE id = v_order_id;
  SELECT payout_settlement_days INTO v_settle FROM public.platform_settings WHERE id;

  -- 24 hours (admin-set) after delivery...
  v_ready := _delivered_at + make_interval(hours => coalesce(r.payout_hold_hours, 24));

  -- ...but not while a return can still come in (end of the window's last day)...
  v_hold_days := coalesce(public.vendor_order_payout_hold_days(_vendor_order_id), 0);
  IF v_hold_days > 0 THEN
    v_ready := greatest(v_ready,
      (((_delivered_at AT TIME ZONE 'Asia/Kolkata')::date + v_hold_days + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'));
  END IF;

  IF v_method IS DISTINCT FROM 'cod' THEN
    -- ...nor before Razorpay has settled an online payment to AllBoutiqs...
    SELECT min(created_at) INTO v_paid_at
    FROM public.payments
    WHERE order_id = v_order_id AND payment_status IN ('paid', 'partially_refunded', 'refunded');
    IF v_paid_at IS NOT NULL THEN
      v_ready := greatest(v_ready,
        (public.add_business_days((v_paid_at AT TIME ZONE 'Asia/Kolkata')::date, coalesce(v_settle, 2))::timestamp AT TIME ZONE 'Asia/Kolkata'));
    END IF;
  ELSIF v_cod_at IS NOT NULL THEN
    -- ...nor before the COD cash has reached AllBoutiqs.
    v_ready := greatest(v_ready, v_cod_at);
  END IF;

  RETURN public.next_payout_date(v_ready);
END;
$$;

-- Delivered: a COD payout depends on the courier's cash arriving first.
CREATE OR REPLACE FUNCTION public.notify_vendor_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_account boolean;
  v_hold integer;
  v_date text := to_char(NEW.payout_eligible_on, 'Dy DD Mon YYYY');
  v_cod boolean;
BEGIN
  IF NOT (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered'
          AND OLD.payout_notified_at IS NULL AND NEW.payout_notified_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = NEW.vendor_id);
  v_hold := coalesce(public.vendor_order_payout_hold_days(NEW.id), 0);
  v_cod := EXISTS (SELECT 1 FROM public.orders WHERE id = NEW.order_id AND payment_method = 'cod') AND NEW.cod_received_at IS NULL;
  IF v_has_account THEN
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_scheduled', 'Order delivered - payout scheduled',
      CASE WHEN v_cod THEN
        format('Order %s was delivered and the courier collected the cash. Your payout of %s will be paid in the first weekly payout after the cash reaches AllBoutiqs from Shiprocket (%s at the earliest).',
          public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date)
      ELSE
        format('Order %s was delivered. Your payout of %s will be paid on %s, in the weekly payout%s.',
          public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date,
          CASE WHEN v_hold > 0 THEN format(' after the %s-day return window', v_hold) ELSE '' END)
      END,
      public.nlink('/vendor', 'payouts', NEW.id));
  ELSE
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_account_missing', 'Order delivered - add your payout account',
      format('Order %s was delivered and %s is due to you%s, but your payout account is not set up yet. Add your bank details so we can pay you.',
        public.order_ref(NEW.order_id), public.inr(NEW.net_payable),
        CASE WHEN v_cod THEN ' once the courier''s cash reaches AllBoutiqs' ELSE ' on ' || v_date END),
      public.vendor_payout_account_link());
  END IF;
  PERFORM public.invoke_edge_function('send-vendor-payout-email', jsonb_build_object('vendor_order_id', NEW.id));
  RETURN NEW;
END;
$$;

-- "Payout ready" only once a COD order's cash has actually arrived.
CREATE OR REPLACE FUNCTION public.process_vendor_payout_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  r record;
  v_status text;
  v_has_account boolean;
BEGIN
  FOR r IN
    SELECT vo.vendor_id, array_agg(vo.id) AS ids, sum(vo.net_payable) AS total, count(*) AS n
    FROM public.vendor_orders vo
    JOIN public.orders o ON o.id = vo.order_id
    WHERE vo.status = 'delivered' AND vo.payout_id IS NULL AND vo.due_notified_at IS NULL
      AND vo.payout_eligible_on IS NOT NULL AND vo.payout_eligible_on <= v_today
      AND (o.payment_method IS DISTINCT FROM 'cod' OR vo.cod_received_at IS NOT NULL OR o.payment_status = 'paid')
    GROUP BY vo.vendor_id
  LOOP
    SELECT payout_account_status INTO v_status FROM public.vendors WHERE id = r.vendor_id;
    v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = r.vendor_id);
    IF v_has_account AND v_status IN ('pending', 'active') THEN
      PERFORM public.notify_vendor_members(r.vendor_id, 'payout_queued', 'Payout ready - in queue',
        format('%s from %s order(s) finished its return window and is now in the queue for your next bank transfer.', public.inr(r.total), r.n),
        public.nlink('/vendor', 'payouts', r.ids[1]));
    ELSE
      PERFORM public.notify_vendor_members(r.vendor_id, 'payout_account_missing', 'Payout ready - bank details needed',
        format('%s from %s order(s) is ready to pay, but %s. Update your payout details so we can send it.', public.inr(r.total), r.n,
          CASE WHEN v_status = 'needs_update' THEN 'your bank declined the last transfer' ELSE 'your payout account is not set up' END),
        public.vendor_payout_account_link());
      UPDATE public.vendors SET payout_reminder_sent_at = now() WHERE id = r.vendor_id;
    END IF;
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'queued', 'vendor_id', r.vendor_id, 'vendor_order_ids', to_jsonb(r.ids)));
    UPDATE public.vendor_orders SET due_notified_at = now() WHERE id = ANY (r.ids);
  END LOOP;

  FOR r IN
    SELECT vo.vendor_id, sum(vo.net_payable) AS total, count(*) AS n
    FROM public.vendor_orders vo
    JOIN public.vendors v ON v.id = vo.vendor_id
    WHERE vo.status = 'delivered' AND vo.payout_id IS NULL
      AND vo.payout_eligible_on IS NOT NULL AND vo.payout_eligible_on <= v_today
      AND (v.payout_account_status IN ('not_setup', 'needs_update')
           OR NOT EXISTS (SELECT 1 FROM public.vendor_payout_accounts a WHERE a.vendor_id = v.id))
      AND (v.payout_reminder_sent_at IS NULL OR v.payout_reminder_sent_at < now() - interval '7 days')
    GROUP BY vo.vendor_id
  LOOP
    PERFORM public.notify_vendor_members(r.vendor_id, 'payout_account_missing', 'Reminder: money waiting for you',
      format('%s from %s order(s) is waiting to be paid. Add or fix your payout bank details so we can transfer it.', public.inr(r.total), r.n),
      public.vendor_payout_account_link());
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'account_reminder', 'vendor_id', r.vendor_id));
    UPDATE public.vendors SET payout_reminder_sent_at = now() WHERE id = r.vendor_id;
  END LOOP;
END;
$$;

-- Cash received for these boutique orders: stamp them, move each payout to
-- the next weekly payout day after the cash arrived, tell the boutique, and
-- mark the customer order paid once every part of it has its cash.
CREATE OR REPLACE FUNCTION public.record_cod_received(_vendor_order_ids uuid[], _utr text, _received_at timestamptz, _source text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  vo record;
BEGIN
  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  WITH done AS (
    UPDATE vendor_orders x SET
      cod_received_at = least(coalesce(_received_at, now()), now()),
      cod_received_utr = nullif(btrim(_utr), ''),
      cod_received_source = _source
    FROM orders o
    WHERE x.id = ANY (_vendor_order_ids) AND o.id = x.order_id AND o.payment_method = 'cod'
      AND x.cod_received_at IS NULL AND x.status <> 'cancelled'
    RETURNING x.id
  )
  SELECT array_agg(id) INTO v_ids FROM done;
  IF v_ids IS NULL THEN
    PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
    RETURN 0;
  END IF;

  UPDATE vendor_orders SET payout_eligible_on = vendor_order_payout_date(id, delivered_at)
  WHERE id = ANY (v_ids) AND status = 'delivered' AND delivered_at IS NOT NULL
    AND payout_id IS NULL AND rzp_transfer_status IS DISTINCT FROM 'released';
  PERFORM set_config('app.vendor_order_fee_calc', 'off', true);

  FOR vo IN SELECT id, vendor_id, order_id, net_payable, payout_eligible_on, status FROM vendor_orders WHERE id = ANY (v_ids) LOOP
    PERFORM notify_vendor_members(vo.vendor_id, 'cod_received', 'COD cash received',
      format('The cash the courier collected for order %s has reached AllBoutiqs.%s', order_ref(vo.order_id),
        CASE WHEN vo.status = 'delivered' AND vo.payout_eligible_on IS NOT NULL
             THEN format(' Your payout of %s will be paid on %s.', inr(vo.net_payable), to_char(vo.payout_eligible_on, 'Dy DD Mon YYYY'))
             ELSE '' END),
      nlink('/vendor', 'payouts', vo.id));
  END LOOP;

  UPDATE orders o SET payment_status = 'paid'
  WHERE o.id IN (SELECT order_id FROM vendor_orders WHERE id = ANY (v_ids))
    AND o.payment_method = 'cod' AND o.payment_status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM vendor_orders x WHERE x.order_id = o.id AND x.status <> 'cancelled' AND x.cod_received_at IS NULL);

  RETURN array_length(v_ids, 1);
END;
$$;
REVOKE ALL ON FUNCTION public.record_cod_received(uuid[], text, timestamptz, text) FROM public, anon, authenticated;

-- An admin marking a COD order "paid" (Orders screen) marks all its parts'
-- cash received too.
CREATE OR REPLACE FUNCTION public.cod_order_marked_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_method = 'cod' AND NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM record_cod_received(
      ARRAY(SELECT id FROM vendor_orders WHERE order_id = NEW.id AND cod_received_at IS NULL AND status <> 'cancelled'),
      NULL, now(), 'manual');
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS cod_order_marked_paid_trigger ON public.orders;
CREATE TRIGGER cod_order_marked_paid_trigger
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.cod_order_marked_paid();

-- Admin: mark COD cash received by hand (bank UTR + date).
CREATE OR REPLACE FUNCTION public.mark_cod_received(_vendor_order_ids uuid[], _utr text, _received_on date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only AllBoutiqs admins can mark COD cash received';
  END IF;
  IF _received_on IS NULL OR _received_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'Enter the date the cash reached the bank (today or earlier)';
  END IF;
  RETURN record_cod_received(_vendor_order_ids, _utr,
    CASE WHEN _received_on = (now() AT TIME ZONE 'Asia/Kolkata')::date THEN now()
         ELSE (_received_on::timestamp + time '12:00') AT TIME ZONE 'Asia/Kolkata' END,
    'manual');
END;
$$;
REVOKE ALL ON FUNCTION public.mark_cod_received(uuid[], text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_cod_received(uuid[], text, date) TO authenticated;

-- After shiprocket-cod-sync has stored a parcel's Shiprocket data: share its
-- COD charge between the boutique orders in it by value (it comes off their
-- payout, until the payout is sent) and mark their cash received once
-- Shiprocket has remitted it.
CREATE OR REPLACE FUNCTION public.apply_shipment_cod(_shipment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.shipments;
  v_method text;
  v_ids uuid[];
  v_total numeric;
  v_left numeric;
  v_share numeric;
  v_n integer;
  v_i integer := 0;
  v_rows integer;
  rec record;
BEGIN
  SELECT * INTO s FROM shipments WHERE id = _shipment_id;
  IF NOT FOUND OR s.cod_amount IS NULL OR s.status = 'cancelled' THEN RETURN; END IF;
  SELECT o.payment_method INTO v_method FROM orders o
  WHERE o.id = coalesce(s.order_id, (SELECT order_id FROM vendor_orders WHERE id = s.vendor_order_id));
  IF v_method IS DISTINCT FROM 'cod' THEN RETURN; END IF;

  SELECT array_agg(id ORDER BY id), sum(goods_value) INTO v_ids, v_total
  FROM vendor_orders
  WHERE status <> 'cancelled'
    AND CASE WHEN s.shipment_type = 'warehouse_to_customer' THEN dispatch_id = s.dispatch_id ELSE id = s.vendor_order_id END;
  IF v_ids IS NULL THEN RETURN; END IF;
  v_n := array_length(v_ids, 1);

  IF s.cod_charge IS NOT NULL THEN
    v_left := s.cod_charge;
    FOR rec IN SELECT id, goods_value FROM vendor_orders WHERE id = ANY (v_ids) ORDER BY id LOOP
      v_i := v_i + 1;
      v_share := CASE WHEN v_i = v_n THEN v_left
                      WHEN coalesce(v_total, 0) > 0 THEN round(s.cod_charge * rec.goods_value / v_total, 2)
                      ELSE round(s.cod_charge / v_n, 2) END;
      v_left := v_left - v_share;
      PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
      UPDATE vendor_orders SET cod_handling_charge = v_share
      WHERE id = rec.id AND cod_handling_charge IS DISTINCT FROM v_share
        AND rzp_transfer_id IS NULL AND payout_id IS NULL;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
      IF v_rows > 0 THEN
        PERFORM compute_vendor_order_fees(rec.id);
      END IF;
    END LOOP;
  END IF;

  IF s.cod_remittance_utr IS NOT NULL OR s.cod_remitted_on IS NOT NULL THEN
    PERFORM record_cod_received(v_ids, s.cod_remittance_utr,
      CASE WHEN s.cod_remitted_on IS NULL OR s.cod_remitted_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN now()
           ELSE (s.cod_remitted_on::timestamp + time '12:00') AT TIME ZONE 'Asia/Kolkata' END,
      'shiprocket');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_shipment_cod(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_shipment_cod(uuid) TO service_role;

-- COD orders with their money stage, for the admin (one boutique or all)
-- and boutique dashboards.
CREATE OR REPLACE FUNCTION public.cod_tracking(_vendor_id uuid)
RETURNS TABLE (
  vendor_order_id uuid,
  vendor_id uuid,
  boutique_name text,
  boutique_code text,
  order_number text,
  order_date date,
  status text,
  delivered_at timestamptz,
  cod_amount numeric,
  cod_charge numeric,
  net_payable numeric,
  awb_code text,
  courier_name text,
  shiprocket_status text,
  cod_received_at timestamptz,
  cod_received_utr text,
  cod_received_source text,
  payout_on date,
  paid_at timestamptz,
  payout_utr text,
  stage text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT (_vendor_id IS NOT NULL AND public.is_vendor_member(auth.uid(), _vendor_id))
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'You can only see your own orders';
  END IF;

  RETURN QUERY
  SELECT vo.id, vo.vendor_id, v.name, v.boutique_code,
         '#' || upper(left(vo.order_id::text, 8)),
         (o.created_at AT TIME ZONE 'Asia/Kolkata')::date,
         vo.status, vo.delivered_at,
         round(vo.goods_value + coalesce(vo.shipping_cost, 0), 2),
         vo.cod_handling_charge, vo.net_payable,
         s.awb_code, s.courier_name, s.cod_remittance_status,
         vo.cod_received_at, vo.cod_received_utr, vo.cod_received_source,
         vo.payout_eligible_on,
         coalesce(vo.rzp_released_at, vp.paid_at),
         coalesce(vo.rzp_settlement_utr, vp.payment_reference),
         CASE
           WHEN vo.status = 'cancelled' THEN 'cancelled'
           WHEN s.status = 'rto' THEN 'not_collected'
           WHEN coalesce(vo.rzp_released_at, vp.paid_at) IS NOT NULL THEN 'paid'
           WHEN vo.cod_received_at IS NOT NULL THEN 'received'
           WHEN vo.delivered_at IS NOT NULL OR vo.status IN ('delivered', 'returned') THEN 'collected'
           ELSE 'awaiting_delivery'
         END
  FROM vendor_orders vo
  JOIN orders o ON o.id = vo.order_id
  JOIN vendors v ON v.id = vo.vendor_id
  LEFT JOIN vendor_payouts vp ON vp.id = vo.payout_id AND vp.status = 'paid'
  LEFT JOIN LATERAL (
    SELECT sh.awb_code, sh.courier_name, sh.cod_remittance_status, sh.status
    FROM shipments sh
    WHERE sh.status <> 'cancelled'
      AND ((sh.shipment_type = 'forward' AND sh.vendor_order_id = vo.id)
           OR (sh.shipment_type = 'warehouse_to_customer' AND vo.dispatch_id IS NOT NULL AND sh.dispatch_id = vo.dispatch_id))
    ORDER BY sh.created_at DESC
    LIMIT 1
  ) s ON true
  WHERE o.payment_method = 'cod'
    AND (_vendor_id IS NULL OR vo.vendor_id = _vendor_id)
    AND o.created_at > now() - interval '1 year'
  ORDER BY o.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.cod_tracking(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cod_tracking(uuid) TO authenticated;

-- Read Shiprocket's COD data before the 10:00 payout run, and again in the
-- evening.
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('shiprocket-cod-sync-morning', 'shiprocket-cod-sync-evening');
SELECT cron.schedule('shiprocket-cod-sync-morning', '0 3 * * *', $$SELECT public.invoke_edge_function('shiprocket-cod-sync', '{}'::jsonb);$$);
SELECT cron.schedule('shiprocket-cod-sync-evening', '30 13 * * *', $$SELECT public.invoke_edge_function('shiprocket-cod-sync', '{}'::jsonb);$$);
