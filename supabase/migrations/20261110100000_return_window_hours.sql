-- Returns close a set number of hours after delivery (2026-11-10).
-- Rule (user): a customer can return or exchange for exactly 24 hours after
-- the delivery - the same for every boutique, set by AllBoutiqs
-- (platform_settings.return_window_hours), not by each boutique. Until now
-- the window was a calendar date (delivery day + the boutique's
-- return_window_days, 7) open until that day's midnight.
--   * vendor_orders.return_window_ends_at: the moment returns close, stamped
--     on delivery (delivered_at + the hours). return_window_ends_on stays,
--     kept as that moment's date (IST), for lists and older screens.
--   * A return request after that moment is refused; the payout waits for it.
--   * Admins can still move one part's window (an exception, e.g. damage
--     reported late) - either column; the other follows.
--   * vendors.return_window_days is no longer used.
-- Parts made only of customised pieces keep their 24 hours (damaged / wrong
-- item only). Parts delivered before this change keep their date.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS return_window_hours integer NOT NULL DEFAULT 24
    CHECK (return_window_hours BETWEEN 1 AND 720);

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS return_window_ends_at timestamptz;

-- When a part's return/exchange window closes.
CREATE OR REPLACE FUNCTION public.vendor_order_window_end_at(
  _vendor_order_id uuid, _delivered_at timestamptz, _ends_at timestamptz, _ends_on date)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.order_items oi WHERE oi.vendor_order_id = _vendor_order_id AND oi.customisation IS NULL
    ) THEN coalesce(_delivered_at, now()) + interval '24 hours'
    ELSE coalesce(
      _ends_at,
      -- delivered before 2026-11-10: open to the end of that day
      ((_ends_on + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'),
      coalesce(_delivered_at, now())
        + make_interval(hours => coalesce((SELECT s.return_window_hours FROM public.platform_settings s WHERE s.id), 24)))
  END;
$$;
REVOKE ALL ON FUNCTION public.vendor_order_window_end_at(uuid, timestamptz, timestamptz, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendor_order_window_end_at(uuid, timestamptz, timestamptz, date) TO authenticated, service_role;

-- The last day the window is open (kept for anything still asking by date).
CREATE OR REPLACE FUNCTION public.vendor_order_window_end(_vendor_order_id uuid, _delivered_at timestamptz, _window_end date)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ((public.vendor_order_window_end_at(_vendor_order_id, _delivered_at,
            (SELECT vo.return_window_ends_at FROM public.vendor_orders vo WHERE vo.id = _vendor_order_id), _window_end)
           - interval '1 second') AT TIME ZONE 'Asia/Kolkata')::date;
$$;

-- Stamped on delivery: delivery + the hours.
CREATE OR REPLACE FUNCTION public.set_return_window_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours integer;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' AND NEW.return_window_ends_at IS NULL THEN
    SELECT return_window_hours INTO v_hours FROM public.platform_settings WHERE id;
    NEW.return_window_ends_at := coalesce(NEW.delivered_at, now()) + make_interval(hours => coalesce(v_hours, 24));
    NEW.return_window_ends_on := (NEW.return_window_ends_at AT TIME ZONE 'Asia/Kolkata')::date;
  END IF;
  RETURN NEW;
END;
$$;

-- Payout date: the first weekly payout day after the part is ready - at
-- least payout_hold_hours after delivery, after its return window has
-- closed, after Razorpay settled an online payment, and after a COD order's
-- cash reached AllBoutiqs.
CREATE OR REPLACE FUNCTION public.vendor_order_payout_date_at(
  _vendor_order_id uuid, _delivered_at timestamptz, _ends_at timestamptz, _ends_on date)
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
  v_ready timestamptz;
BEGIN
  SELECT order_id, cod_received_at INTO v_order_id, v_cod_at FROM public.vendor_orders WHERE id = _vendor_order_id;
  SELECT payment_method INTO v_method FROM public.orders WHERE id = v_order_id;
  SELECT payout_settlement_days INTO v_settle FROM public.platform_settings WHERE id;

  v_ready := _delivered_at + make_interval(hours => coalesce(r.payout_hold_hours, 24));
  v_ready := greatest(v_ready, public.vendor_order_window_end_at(_vendor_order_id, _delivered_at, _ends_at, _ends_on));

  IF v_method IS DISTINCT FROM 'cod' THEN
    SELECT min(created_at) INTO v_paid_at
    FROM public.payments
    WHERE order_id = v_order_id AND payment_status IN ('paid', 'partially_refunded', 'refunded');
    IF v_paid_at IS NOT NULL THEN
      v_ready := greatest(v_ready,
        (public.add_business_days((v_paid_at AT TIME ZONE 'Asia/Kolkata')::date, coalesce(v_settle, 2))::timestamp AT TIME ZONE 'Asia/Kolkata'));
    END IF;
  ELSIF v_cod_at IS NOT NULL THEN
    v_ready := greatest(v_ready, v_cod_at);
  END IF;

  RETURN public.next_payout_date(v_ready);
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_order_payout_date_at(uuid, timestamptz, timestamptz, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendor_order_payout_date_at(uuid, timestamptz, timestamptz, date) TO authenticated, service_role;

-- The older entry points, now via the moment.
CREATE OR REPLACE FUNCTION public.vendor_order_payout_date_for(_vendor_order_id uuid, _delivered_at timestamptz, _window_end date)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.vendor_order_payout_date_at(_vendor_order_id, _delivered_at,
    (SELECT return_window_ends_at FROM public.vendor_orders WHERE id = _vendor_order_id), _window_end);
$$;

CREATE OR REPLACE FUNCTION public.vendor_order_payout_date(_vendor_order_id uuid, _delivered_at timestamptz)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.vendor_order_payout_date_at(vo.id, _delivered_at, vo.return_window_ends_at, vo.return_window_ends_on)
  FROM public.vendor_orders vo WHERE vo.id = _vendor_order_id;
$$;

CREATE OR REPLACE FUNCTION public.stamp_vendor_order_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := coalesce(NEW.delivered_at, now());
    NEW.payout_eligible_on := public.vendor_order_payout_date_at(NEW.id, NEW.delivered_at, NEW.return_window_ends_at, NEW.return_window_ends_on);
    IF NEW.payout_eligible_on <= (NEW.delivered_at AT TIME ZONE 'Asia/Kolkata')::date THEN
      NEW.due_notified_at := coalesce(NEW.due_notified_at, now());
    END IF;
    IF OLD.payout_notified_at IS NULL THEN
      NEW.payout_notified_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Only the AllBoutiqs team moves a window.
CREATE OR REPLACE FUNCTION public.guard_vendor_order_return_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.return_window_ends_on IS DISTINCT FROM OLD.return_window_ends_on
      OR NEW.return_window_ends_at IS DISTINCT FROM OLD.return_window_ends_at)
     AND current_user::text IN ('anon', 'authenticated')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only the AllBoutiqs team can change a return window';
  END IF;
  RETURN NEW;
END;
$$;

-- An admin moved a window: keep the two columns together and move the payout.
CREATE OR REPLACE FUNCTION public.reschedule_payout_on_window_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.return_window_ends_at IS DISTINCT FROM OLD.return_window_ends_at THEN
    NEW.return_window_ends_on := (NEW.return_window_ends_at AT TIME ZONE 'Asia/Kolkata')::date;
  ELSIF NEW.return_window_ends_on IS DISTINCT FROM OLD.return_window_ends_on THEN
    NEW.return_window_ends_at := ((NEW.return_window_ends_on + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  ELSE
    RETURN NEW;
  END IF;
  IF NEW.status = 'delivered' AND NEW.delivered_at IS NOT NULL
     AND NEW.payout_id IS NULL AND NEW.rzp_transfer_status IS DISTINCT FROM 'released' THEN
    NEW.payout_eligible_on := public.vendor_order_payout_date_at(NEW.id, NEW.delivered_at, NEW.return_window_ends_at, NEW.return_window_ends_on);
    IF NEW.payout_eligible_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      NEW.due_notified_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reschedule_payout_on_window_change_trigger ON public.vendor_orders;
CREATE TRIGGER reschedule_payout_on_window_change_trigger
  BEFORE UPDATE OF return_window_ends_on, return_window_ends_at ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.reschedule_payout_on_window_change();

-- A return/exchange request after the window has closed is refused.
CREATE OR REPLACE FUNCTION public.enforce_return_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_end timestamptz;
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR coalesce(auth.role(), 'postgres') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT oi.product_title, oi.customisation IS NOT NULL AS customised, vo.id AS vendor_order_id, vo.status,
           vo.return_window_ends_on, vo.return_window_ends_at, vo.delivered_at
    FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) AS e
    JOIN public.order_items oi ON oi.id::text = e->>'order_item_id'
    LEFT JOIN public.vendor_orders vo ON vo.id = oi.vendor_order_id
  LOOP
    -- Items not sold by a boutique have no delivery tracking to check.
    CONTINUE WHEN r.vendor_order_id IS NULL;
    IF r.status IS DISTINCT FROM 'delivered' THEN
      RAISE EXCEPTION '"%" hasn''t been delivered yet, so it can''t be returned or exchanged.', r.product_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF r.customised THEN
      IF NEW.request_type IS DISTINCT FROM 'return' THEN
        RAISE EXCEPTION '"%" was customised for you, so it can''t be exchanged.', r.product_title
          USING ERRCODE = 'check_violation';
      END IF;
      IF coalesce(NEW.reason, '') NOT IN ('Defective or damaged product', 'Wrong item received') THEN
        RAISE EXCEPTION '"%" was customised for you - it can only be returned if it arrived damaged or was the wrong item.', r.product_title
          USING ERRCODE = 'check_violation';
      END IF;
      IF coalesce(r.delivered_at, now()) + interval '24 hours' < now() THEN
        RAISE EXCEPTION 'The 24-hour return window for "%" (customised) has closed.', r.product_title
          USING ERRCODE = 'check_violation';
      END IF;
      CONTINUE;
    END IF;
    v_end := public.vendor_order_window_end_at(r.vendor_order_id, r.delivered_at, r.return_window_ends_at, r.return_window_ends_on);
    IF now() >= v_end THEN
      RAISE EXCEPTION 'The return window for "%" closed on % at %.', r.product_title,
        to_char(v_end AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY'), to_char(v_end AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- Why a delivered part can't be paid yet (NULL = it can).
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

  IF coalesce(vo.net_payable, 0) - coalesce(vo.rzp_reversed_amount, 0) <= 0 THEN RETURN 'nothing_to_pay'; END IF;
  RETURN NULL;
END;
$$;

-- How long a part's window is, in hours (for messages).
CREATE OR REPLACE FUNCTION public.vendor_order_return_window_hours(_vendor_order_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(0, round(extract(epoch FROM (
           public.vendor_order_window_end_at(vo.id, vo.delivered_at, vo.return_window_ends_at, vo.return_window_ends_on)
           - coalesce(vo.delivered_at, now()))) / 3600))::integer
  FROM public.vendor_orders vo
  WHERE vo.id = _vendor_order_id;
$$;
REVOKE ALL ON FUNCTION public.vendor_order_return_window_hours(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendor_order_return_window_hours(uuid) TO authenticated, service_role;

-- Whole days the payout waits for the window (rounded up), kept for callers
-- that still count in days.
CREATE OR REPLACE FUNCTION public.vendor_order_payout_hold_days(_vendor_order_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ceil(coalesce(public.vendor_order_return_window_hours(_vendor_order_id), 0) / 24.0)::integer;
$$;

-- "Order delivered - payout scheduled": the window in hours.
CREATE OR REPLACE FUNCTION public.notify_vendor_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_account boolean;
  v_hours integer;
  v_date text := to_char(NEW.payout_eligible_on, 'Dy DD Mon YYYY');
  v_cod boolean;
BEGIN
  IF NOT (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered'
          AND OLD.payout_notified_at IS NULL AND NEW.payout_notified_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = NEW.vendor_id);
  v_hours := round(extract(epoch FROM (
    public.vendor_order_window_end_at(NEW.id, NEW.delivered_at, NEW.return_window_ends_at, NEW.return_window_ends_on)
    - NEW.delivered_at)) / 3600)::integer;
  v_cod := EXISTS (SELECT 1 FROM public.orders WHERE id = NEW.order_id AND payment_method = 'cod') AND NEW.cod_received_at IS NULL;
  IF v_has_account THEN
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_scheduled', 'Order delivered - payout scheduled',
      CASE WHEN v_cod THEN
        format('Order %s was delivered and the courier collected the cash. Your payout of %s will be paid in the first weekly payout after the cash reaches AllBoutiqs from Shiprocket (%s at the earliest).',
          public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date)
      ELSE
        format('Order %s was delivered. Your payout of %s will be paid on %s, in the weekly payout%s.',
          public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date,
          CASE WHEN v_hours > 0 THEN format(' after the %s-hour return window', v_hours) ELSE '' END)
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
