-- Weekly payouts (step 9): an order becomes payable payout_hold_hours (24h)
-- after delivery - and not before its return window ends or the online
-- payment has settled - and is then paid on the next payment day after a
-- weekly cut-off (Tuesday 11:59 PM -> Wednesday). Day, time and hours come
-- from the admin's rates (platform_rates). The daily Razorpay release run
-- pays everything whose payout date has come, so it pays on Wednesdays.

-- Payment date for money ready at _ready_at: the first cut-off at or after
-- it, then the payment weekday that follows that cut-off.
CREATE OR REPLACE FUNCTION public.next_payout_date(_ready_at timestamptz)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  r public.platform_rates := public.rates_on(now());
  v_local timestamp := _ready_at AT TIME ZONE 'Asia/Kolkata';
  v_cutoff timestamp;
BEGIN
  v_cutoff := (v_local::date + ((r.payout_cutoff_weekday - extract(isodow FROM v_local)::int + 7) % 7)) + r.payout_cutoff_time;
  IF v_cutoff < v_local THEN
    v_cutoff := v_cutoff + interval '7 days';
  END IF;
  RETURN v_cutoff::date + (((r.payout_weekday - r.payout_cutoff_weekday + 6) % 7) + 1);
END;
$$;

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
  v_method text;
  v_paid_at timestamptz;
  v_settle integer;
  v_hold_days integer;
  v_ready timestamptz;
BEGIN
  SELECT order_id INTO v_order_id FROM public.vendor_orders WHERE id = _vendor_order_id;
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

  -- ...nor before Razorpay has settled an online payment to AllBoutiqs.
  IF v_method IS DISTINCT FROM 'cod' THEN
    SELECT min(created_at) INTO v_paid_at
    FROM public.payments
    WHERE order_id = v_order_id AND payment_status IN ('paid', 'partially_refunded', 'refunded');
    IF v_paid_at IS NOT NULL THEN
      v_ready := greatest(v_ready,
        (public.add_business_days((v_paid_at AT TIME ZONE 'Asia/Kolkata')::date, coalesce(v_settle, 2))::timestamp AT TIME ZONE 'Asia/Kolkata'));
    END IF;
  END IF;

  RETURN public.next_payout_date(v_ready);
END;
$$;

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
BEGIN
  IF NOT (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered'
          AND OLD.payout_notified_at IS NULL AND NEW.payout_notified_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = NEW.vendor_id);
  v_hold := coalesce(public.vendor_order_payout_hold_days(NEW.id), 0);
  IF v_has_account THEN
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_scheduled', 'Order delivered - payout scheduled',
      format('Order %s was delivered. Your payout of %s will be paid on %s, in the weekly payout%s.',
        public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date,
        CASE WHEN v_hold > 0 THEN format(' after the %s-day return window', v_hold) ELSE '' END),
      public.nlink('/vendor', 'payouts', NEW.id));
  ELSE
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_account_missing', 'Order delivered - add your payout account',
      format('Order %s was delivered and %s is due to you on %s, but your payout account is not set up yet. Add your bank details so we can pay you.',
        public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date),
      public.vendor_payout_account_link());
  END IF;
  PERFORM public.invoke_edge_function('send-vendor-payout-email', jsonb_build_object('vendor_order_id', NEW.id));
  RETURN NEW;
END;
$$;
