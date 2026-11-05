-- When a vendor order is delivered, schedule its payout and tell the
-- boutique (bell + email). Payout date = the later of:
--   * delivery date + the boutique's return window, or the delivery date
--     itself when nothing in it can be returned (non-returnable items, or
--     the boutique has returns switched off);
--   * for online (Razorpay) payments, the payment date + Razorpay's
--     settlement time in working days (admin-configurable, default T+2).
-- If the boutique hasn't added a payout account yet, it's told to set one
-- up instead. Payout runs (generate-vendor-payouts) only pick orders up
-- once this date has arrived.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS payout_settlement_days integer NOT NULL DEFAULT 2
    CHECK (payout_settlement_days BETWEEN 0 AND 30);

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_eligible_on date,
  ADD COLUMN IF NOT EXISTS payout_notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.add_business_days(_d date, _n integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d date := _d;
  added integer := 0;
BEGIN
  WHILE added < _n LOOP
    d := d + 1;
    IF extract(isodow FROM d) < 6 THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- Days the payout waits after delivery: the boutique's return window if
-- anything in this vendor order can still be returned, otherwise 0.
CREATE OR REPLACE FUNCTION public.vendor_order_payout_hold_days(_vendor_order_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(v.returns_enabled, true)
     AND EXISTS (
       SELECT 1 FROM public.order_items oi
       WHERE oi.vendor_order_id = vo.id AND oi.is_returnable
     )
    THEN coalesce(v.return_window_days, 7)
    ELSE 0
  END
  FROM public.vendor_orders vo
  JOIN public.vendors v ON v.id = vo.vendor_id
  WHERE vo.id = _vendor_order_id;
$$;

CREATE OR REPLACE FUNCTION public.vendor_order_payout_date(_vendor_order_id uuid, _delivered_at timestamptz)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_delivered date := (_delivered_at AT TIME ZONE 'Asia/Kolkata')::date;
  v_method text;
  v_paid_at timestamptz;
  v_settle integer;
  v_money_ready date;
BEGIN
  SELECT order_id INTO v_order_id FROM public.vendor_orders WHERE id = _vendor_order_id;
  SELECT payment_method INTO v_method FROM public.orders WHERE id = v_order_id;
  SELECT payout_settlement_days INTO v_settle FROM public.platform_settings WHERE id;

  -- Cash on delivery has no Razorpay leg; its money is in hand at delivery.
  IF v_method IS DISTINCT FROM 'cod' THEN
    SELECT min(created_at) INTO v_paid_at
    FROM public.payments
    WHERE order_id = v_order_id AND payment_status IN ('paid', 'partially_refunded', 'refunded');
  END IF;

  v_money_ready := CASE
    WHEN v_paid_at IS NULL THEN v_delivered
    ELSE public.add_business_days((v_paid_at AT TIME ZONE 'Asia/Kolkata')::date, coalesce(v_settle, 2))
  END;

  RETURN greatest(v_delivered + coalesce(public.vendor_order_payout_hold_days(_vendor_order_id), 0), v_money_ready);
END;
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
    NEW.payout_eligible_on := public.vendor_order_payout_date(NEW.id, NEW.delivered_at);
    -- Notify only on the first delivery of this vendor order.
    IF OLD.payout_notified_at IS NULL THEN
      NEW.payout_notified_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_vendor_order_delivery_trigger ON public.vendor_orders;
CREATE TRIGGER stamp_vendor_order_delivery_trigger
  BEFORE UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_vendor_order_delivery();

-- Calls an edge function from the database. The project URL and service
-- key live in Supabase Vault (secrets "project_url" / "service_role_key",
-- created once outside migrations so the key is never in the repo).
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_edge_function(_name text, _body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'invoke_edge_function: Vault secrets project_url/service_role_key missing, % not called', _name;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || _name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := _body
  );
END;
$$;

-- Server-side only: a client able to call this could fire service-role
-- requests at any edge function.
REVOKE ALL ON FUNCTION public.invoke_edge_function(text, jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_vendor_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_account boolean;
  v_hold integer;
  v_ref text := '#' || left(NEW.order_id::text, 8);
  v_amount text := '₹' || to_char(round(NEW.net_payable), 'FM99999999990');
  v_date text := to_char(NEW.payout_eligible_on, 'DD Mon YYYY');
  v_title text;
  v_body text;
  v_type text;
  v_member uuid;
BEGIN
  IF NOT (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered'
          AND OLD.payout_notified_at IS NULL AND NEW.payout_notified_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = NEW.vendor_id);
  v_hold := coalesce(public.vendor_order_payout_hold_days(NEW.id), 0);

  IF v_has_account THEN
    v_type := 'payout_scheduled';
    v_title := 'Order delivered - payout scheduled';
    v_body := format('Order %s was delivered. Your payout of %s is scheduled for %s %s.',
      v_ref, v_amount, v_date,
      CASE WHEN v_hold > 0 THEN format('(after the %s-day return window)', v_hold)
           ELSE '(non-returnable, so no return-window wait)' END);
  ELSE
    v_type := 'payout_account_missing';
    v_title := 'Order delivered - add your payout account';
    v_body := format('Order %s was delivered and %s is due to you on %s, but your payout account is not set up yet. Add your bank details so we can pay you.',
      v_ref, v_amount, v_date);
  END IF;

  FOR v_member IN SELECT user_id FROM public.vendor_members WHERE vendor_id = NEW.vendor_id LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (v_member, 'order', v_type, v_title, v_body, '/vendor?tab=payouts');
  END LOOP;

  PERFORM public.invoke_edge_function('send-vendor-payout-email', jsonb_build_object('vendor_order_id', NEW.id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_vendor_order_delivered_trigger ON public.vendor_orders;
CREATE TRIGGER notify_vendor_order_delivered_trigger
  AFTER UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_vendor_order_delivered();

-- Existing deliveries: record when they were delivered and when they become
-- payable, without notifying anyone retroactively.
UPDATE public.vendor_orders vo
SET delivered_at = coalesce(
      (SELECT max(s.delivered_at) FROM public.shipments s WHERE s.vendor_order_id = vo.id AND s.delivered_at IS NOT NULL),
      vo.updated_at),
    payout_notified_at = coalesce(vo.payout_notified_at, now())
WHERE vo.status = 'delivered' AND vo.delivered_at IS NULL;

UPDATE public.vendor_orders
SET payout_eligible_on = public.vendor_order_payout_date(id, delivered_at)
WHERE status = 'delivered' AND payout_eligible_on IS NULL;
