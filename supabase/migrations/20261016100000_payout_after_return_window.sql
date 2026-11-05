-- Boutiques are paid only once the return/exchange window has closed.
-- Rule (user, 2026-10-16): a boutique order becomes payable only after its
-- return/exchange window has ended - for every boutique, no exceptions -
-- and never while a return/exchange on it is still open. Before this:
--   * a part with only "exchange-only" (non-refundable) items had no hold, so
--     it was paid 24 hours after delivery while an exchange could still come;
--   * an admin extending a part's window didn't move its payout date;
--   * the payout runs didn't re-check the window, and the Route release
--     missed several open return states (pickup scheduled, at the warehouse,
--     QC...).
-- The window is the part's return_window_ends_on (set on delivery, admins can
-- move it). A part made only of customised pieces has no window (they can't
-- be returned or exchanged) and keeps the 24-hour rule.

-- The last day of a part's return/exchange window, or NULL if it has none.
CREATE OR REPLACE FUNCTION public.vendor_order_window_end(_vendor_order_id uuid, _delivered_at timestamptz, _window_end date)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.order_items oi WHERE oi.vendor_order_id = _vendor_order_id AND oi.customisation IS NULL
    ) THEN NULL
    ELSE coalesce(
      _window_end,
      (coalesce(_delivered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date
        + coalesce((SELECT v.return_window_days FROM public.vendor_orders vo JOIN public.vendors v ON v.id = vo.vendor_id
                    WHERE vo.id = _vendor_order_id), 7))
  END;
$$;
REVOKE ALL ON FUNCTION public.vendor_order_window_end(uuid, timestamptz, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendor_order_window_end(uuid, timestamptz, date) TO authenticated, service_role;

-- Payout date: the first weekly payout day after the part is ready -
-- at least payout_hold_hours (24h) after delivery, after the end of its
-- return/exchange window, after Razorpay settled an online payment, and
-- after a COD order's cash reached AllBoutiqs.
CREATE OR REPLACE FUNCTION public.vendor_order_payout_date_for(_vendor_order_id uuid, _delivered_at timestamptz, _window_end date)
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
  v_end date;
  v_ready timestamptz;
BEGIN
  SELECT order_id, cod_received_at INTO v_order_id, v_cod_at FROM public.vendor_orders WHERE id = _vendor_order_id;
  SELECT payment_method INTO v_method FROM public.orders WHERE id = v_order_id;
  SELECT payout_settlement_days INTO v_settle FROM public.platform_settings WHERE id;

  v_ready := _delivered_at + make_interval(hours => coalesce(r.payout_hold_hours, 24));

  -- Not before the return/exchange window's last day is over.
  v_end := public.vendor_order_window_end(_vendor_order_id, _delivered_at, _window_end);
  IF v_end IS NOT NULL THEN
    v_ready := greatest(v_ready, ((v_end + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'));
  END IF;

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
REVOKE ALL ON FUNCTION public.vendor_order_payout_date_for(uuid, timestamptz, date) FROM public, anon;

CREATE OR REPLACE FUNCTION public.vendor_order_payout_date(_vendor_order_id uuid, _delivered_at timestamptz)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.vendor_order_payout_date_for(_vendor_order_id, _delivered_at,
    (SELECT return_window_ends_on FROM public.vendor_orders WHERE id = _vendor_order_id));
$$;

-- Days the payout waits for the window (for messages): window end - delivery day.
CREATE OR REPLACE FUNCTION public.vendor_order_payout_hold_days(_vendor_order_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    public.vendor_order_window_end(vo.id, vo.delivered_at, vo.return_window_ends_on)
      - (coalesce(vo.delivered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date,
    0)
  FROM public.vendor_orders vo
  WHERE vo.id = _vendor_order_id;
$$;

-- On delivery: the window is set first (set_return_window_on_delivery runs
-- before this - triggers fire in name order), then the payout date from it.
CREATE OR REPLACE FUNCTION public.stamp_vendor_order_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := coalesce(NEW.delivered_at, now());
    NEW.payout_eligible_on := public.vendor_order_payout_date_for(NEW.id, NEW.delivered_at, NEW.return_window_ends_on);
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

-- An admin moving a part's window moves its payout date too (unless it has
-- already been paid).
CREATE OR REPLACE FUNCTION public.reschedule_payout_on_window_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.return_window_ends_on IS DISTINCT FROM OLD.return_window_ends_on
     AND NEW.status = 'delivered' AND NEW.delivered_at IS NOT NULL
     AND NEW.payout_id IS NULL AND NEW.rzp_transfer_status IS DISTINCT FROM 'released' THEN
    NEW.payout_eligible_on := public.vendor_order_payout_date_for(NEW.id, NEW.delivered_at, NEW.return_window_ends_on);
    IF NEW.payout_eligible_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      NEW.due_notified_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reschedule_payout_on_window_change_trigger ON public.vendor_orders;
CREATE TRIGGER reschedule_payout_on_window_change_trigger
  BEFORE UPDATE OF return_window_ends_on ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.reschedule_payout_on_window_change();

-- Why a boutique order can't be paid right now - NULL when it can. Every
-- payout run (Razorpay Route release, RazorpayX, manual) checks this at the
-- moment of paying, not just the stored date.
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
  v_end date;
BEGIN
  SELECT * INTO vo FROM public.vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF vo.payout_id IS NOT NULL OR vo.rzp_transfer_status = 'released' THEN RETURN 'paid'; END IF;
  IF vo.status IS DISTINCT FROM 'delivered' THEN RETURN 'not_delivered'; END IF;

  v_end := public.vendor_order_window_end(vo.id, vo.delivered_at, vo.return_window_ends_on);
  IF v_end IS NOT NULL AND v_end >= v_today THEN RETURN 'return_window_open'; END IF;

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
REVOKE ALL ON FUNCTION public.vendor_order_payout_blocker(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendor_order_payout_blocker(uuid) TO authenticated, service_role;

-- The same check for many parts at once (payout runs).
CREATE OR REPLACE FUNCTION public.vendor_order_payout_blockers(_vendor_order_ids uuid[])
RETURNS TABLE (vendor_order_id uuid, blocker text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, public.vendor_order_payout_blocker(id) FROM unnest(_vendor_order_ids) AS id;
$$;
REVOKE ALL ON FUNCTION public.vendor_order_payout_blockers(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_order_payout_blockers(uuid[]) TO service_role;

-- Parts delivered but not yet paid get their date under the new rule
-- (the flag lets this past protect_vendor_order_payout_fields).
SELECT set_config('app.vendor_order_fee_calc', 'on', true);
UPDATE public.vendor_orders vo
SET payout_eligible_on = public.vendor_order_payout_date_for(vo.id, vo.delivered_at, vo.return_window_ends_on)
WHERE vo.status = 'delivered' AND vo.delivered_at IS NOT NULL
  AND vo.payout_id IS NULL AND vo.rzp_transfer_status IS DISTINCT FROM 'released';
SELECT set_config('app.vendor_order_fee_calc', 'off', true);
