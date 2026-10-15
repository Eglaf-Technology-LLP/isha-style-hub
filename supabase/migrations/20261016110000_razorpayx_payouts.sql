-- Boutique payouts through RazorpayX (2026-10-16). Razorpay Route needs over
-- ₹40 lakh of AllBoutiqs' own turnover (RBI PA rules), so payments settle to
-- AllBoutiqs' RazorpayX current account and AllBoutiqs pays each boutique
-- every payout day with a RazorpayX payout (bank transfer), COD cash
-- included.
--   * A boutique's bank account becomes a RazorpayX contact + fund account
--     and is checked with a ₹1 deposit; the bank's account-holder name must
--     match (an admin can accept a mismatch).
--   * Each payout day the boutique orders that are ready (return/exchange
--     window closed, nothing open - vendor_order_payout_blocker) are batched
--     per boutique into vendor_payouts; an admin approves and sends them (or
--     they go automatically when payout_auto_send is on). Every order is
--     re-checked at the moment of sending.
--   * Razorpay tells us when each transfer is credited (UTR) or fails; a
--     failed transfer puts the orders back in the queue (existing triggers).
-- The manual way (pay outside, "Mark credited" with the UTR) still works.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS payout_rail text NOT NULL DEFAULT 'razorpayx'
    CHECK (payout_rail IN ('razorpayx', 'razorpay_route', 'manual')),
  -- false: an admin approves and sends each payout day's batch
  ADD COLUMN IF NOT EXISTS payout_auto_send boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Boutique bank accounts in RazorpayX
-- ---------------------------------------------------------------------------
ALTER TABLE public.vendor_payout_accounts
  ADD COLUMN IF NOT EXISTS rzpx_contact_id text,
  ADD COLUMN IF NOT EXISTS rzpx_fund_account_id text,
  ADD COLUMN IF NOT EXISTS rzpx_validation_id text,
  -- not_started | registered (in RazorpayX, not yet checked) | verifying |
  -- verified | name_mismatch | invalid | failed (couldn't reach RazorpayX)
  ADD COLUMN IF NOT EXISTS rzpx_status text NOT NULL DEFAULT 'not_started'
    CHECK (rzpx_status IN ('not_started', 'registered', 'verifying', 'verified', 'name_mismatch', 'invalid', 'failed')),
  ADD COLUMN IF NOT EXISTS rzpx_registered_name text,
  ADD COLUMN IF NOT EXISTS rzpx_error text,
  ADD COLUMN IF NOT EXISTS rzpx_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rzpx_name_approved_by uuid REFERENCES auth.users(id);

-- RazorpayX fields are written only by the server (and admins); changed
-- bank details start the check again with a new fund account.
CREATE OR REPLACE FUNCTION public.guard_payout_account_rzpx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_privileged_writer() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.rzpx_contact_id := NULL;
      NEW.rzpx_fund_account_id := NULL;
      NEW.rzpx_validation_id := NULL;
      NEW.rzpx_status := 'not_started';
      NEW.rzpx_registered_name := NULL;
      NEW.rzpx_error := NULL;
      NEW.rzpx_verified_at := NULL;
      NEW.rzpx_name_approved_by := NULL;
    ELSE
      NEW.rzpx_contact_id := OLD.rzpx_contact_id;
      NEW.rzpx_fund_account_id := OLD.rzpx_fund_account_id;
      NEW.rzpx_validation_id := OLD.rzpx_validation_id;
      NEW.rzpx_status := OLD.rzpx_status;
      NEW.rzpx_registered_name := OLD.rzpx_registered_name;
      NEW.rzpx_error := OLD.rzpx_error;
      NEW.rzpx_verified_at := OLD.rzpx_verified_at;
      NEW.rzpx_name_approved_by := OLD.rzpx_name_approved_by;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.bank_account_number IS DISTINCT FROM OLD.bank_account_number
    OR NEW.bank_ifsc IS DISTINCT FROM OLD.bank_ifsc
    OR NEW.account_holder_name IS DISTINCT FROM OLD.account_holder_name) THEN
    NEW.rzpx_fund_account_id := NULL;
    NEW.rzpx_validation_id := NULL;
    NEW.rzpx_status := CASE WHEN NEW.rzpx_contact_id IS NULL THEN 'not_started' ELSE 'registered' END;
    NEW.rzpx_registered_name := NULL;
    NEW.rzpx_error := NULL;
    NEW.rzpx_verified_at := NULL;
    NEW.rzpx_name_approved_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_payout_account_rzpx_trigger ON public.vendor_payout_accounts;
CREATE TRIGGER guard_payout_account_rzpx_trigger
  BEFORE INSERT OR UPDATE ON public.vendor_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_payout_account_rzpx();

-- ---------------------------------------------------------------------------
-- Payouts
-- ---------------------------------------------------------------------------
ALTER TABLE public.vendor_payouts
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'manual' CHECK (method IN ('manual', 'razorpayx')),
  ADD COLUMN IF NOT EXISTS payout_date date,
  ADD COLUMN IF NOT EXISTS rzpx_payout_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS rzpx_status text,
  ADD COLUMN IF NOT EXISTS rzpx_mode text,
  ADD COLUMN IF NOT EXISTS rzpx_fees numeric(12,2),
  ADD COLUMN IF NOT EXISTS rzpx_tax numeric(12,2),
  ADD COLUMN IF NOT EXISTS rzpx_error text,
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- A boutique order counts as paid once its transfer is on its way or done;
-- one sitting in a batch that hasn't been sent is re-checked when it is.
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
  IF vo.rzp_transfer_status = 'released'
     OR EXISTS (SELECT 1 FROM public.vendor_payouts p WHERE p.id = vo.payout_id AND p.status IN ('processing', 'paid')) THEN
    RETURN 'paid';
  END IF;
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

-- Payout day batch: every ready boutique order not yet in a batch, one
-- pending payout per boutique (added to that boutique's unsent batch for the
-- day if there is one). Boutiques with no usable bank account keep their
-- money queued. Returns what it did, per boutique.
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
           sum(vo.subtotal + coalesce(vo.shipping_cost, 0)) AS gross,
           sum(vo.commission_amount) AS commission,
           min((vo.delivered_at AT TIME ZONE 'Asia/Kolkata')::date) AS first_day
    FROM public.vendor_orders vo
    JOIN public.vendors v ON v.id = vo.vendor_id
    WHERE vo.payout_id IS NULL
      AND vo.status = 'delivered'
      AND vo.rzp_transfer_status IS DISTINCT FROM 'released'
      AND public.vendor_order_payout_blocker(vo.id) IS NULL
    GROUP BY vo.vendor_id, v.name
  LOOP
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
REVOKE ALL ON FUNCTION public.prepare_vendor_payouts(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.prepare_vendor_payouts(date) TO authenticated, service_role;

-- Just before sending: take out any order that isn't payable any more (a
-- return opened, the window was extended...) and re-total the batch.
-- Returns the amount still to send (0 = nothing; the batch is removed).
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

  IF v_keep IS NULL THEN
    DELETE FROM public.vendor_payouts WHERE id = _payout_id;
    RETURN 0;
  END IF;

  UPDATE public.vendor_payouts x SET
    order_count = array_length(v_keep, 1),
    vendor_order_ids = v_keep,
    gross_sales = (SELECT sum(subtotal + coalesce(shipping_cost, 0)) FROM public.vendor_orders WHERE id = ANY (v_keep)),
    commission_amount = (SELECT sum(commission_amount) FROM public.vendor_orders WHERE id = ANY (v_keep)),
    net_payable = (SELECT sum(net_payable - coalesce(rzp_reversed_amount, 0)) FROM public.vendor_orders WHERE id = ANY (v_keep))
  WHERE x.id = _payout_id
  RETURNING x.net_payable INTO p.net_payable;
  RETURN p.net_payable;
END;
$$;
REVOKE ALL ON FUNCTION public.recheck_vendor_payout(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recheck_vendor_payout(uuid) TO authenticated, service_role;

-- Boutique messages: "processing" when the transfer is actually sent (a
-- batch waiting for approval isn't a transfer yet); credited/failed as before.
CREATE OR REPLACE FUNCTION public.vendor_payout_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acct text := coalesce(' ending ' || NEW.bank_account_last4, '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'processing' THEN
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_processing', 'Payout processing',
      format('We''ve started the bank transfer of %s for %s order(s) to your account%s.',
             public.inr(NEW.net_payable), NEW.order_count, v_acct));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'processing', 'payout_id', NEW.id));
  ELSIF NEW.status = 'paid' THEN
    UPDATE public.vendors SET payout_account_status = 'active'
    WHERE id = NEW.vendor_id AND payout_account_status IN ('pending', 'needs_update');
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_credited', 'Payout credited',
      format('%s was credited to your account%s. Bank reference (UTR): %s.',
             public.inr(NEW.net_payable), v_acct, NEW.payment_reference));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'credited', 'payout_id', NEW.id));
  ELSIF NEW.status = 'failed' THEN
    -- The money is still owed: put the orders back in the queue (already
    -- told, so the daily "queued" alert doesn't repeat) for the next run.
    PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
    UPDATE public.vendor_orders
    SET payout_id = NULL, due_notified_at = coalesce(due_notified_at, now())
    WHERE payout_id = NEW.id;
    PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
    UPDATE public.vendors SET payout_account_status = 'needs_update', payout_reminder_sent_at = now()
    WHERE id = NEW.vendor_id AND payout_account_status <> 'disabled';
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_failed', 'Bank declined your payout',
      format('Your bank declined the transfer of %s (%s). The money is safe in your payout queue - update your bank details and we''ll send it in the next payout run.',
             public.inr(NEW.net_payable), NEW.failure_reason));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'failed', 'payout_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Schedule: payout day, 09:30 IST (after the cut-off; before the old 10:00
-- Route run, which now only runs when the rail is Route).
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'razorpayx-payout-day';
SELECT cron.schedule('razorpayx-payout-day', '0 4 * * *',
  $$SELECT public.invoke_edge_function('razorpayx-payouts', '{"action":"payout_day"}'::jsonb);$$);
