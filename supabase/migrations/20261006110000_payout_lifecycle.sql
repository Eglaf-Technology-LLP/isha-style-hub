-- Full payout lifecycle for boutiques, with a bell alert + email on every
-- event (via invoke_edge_function -> send-vendor-payout-email):
--   delivered -> (return window) -> queued -> processing (in a payout run)
--   -> credited (admin records the bank UTR) or declined by the bank
--   (admin records why; the money goes back to the queue and the account
--   is flagged until the boutique updates its bank details).
-- Boutiques without usable bank details are skipped by payout runs (their
-- money waits in the queue) and reminded weekly.

-- Account status: 'needs_update' = the bank declined the last transfer.
ALTER TABLE public.vendors DROP CONSTRAINT vendors_payout_account_status_check;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_payout_account_status_check
  CHECK (payout_account_status IN ('not_setup', 'pending', 'active', 'needs_update', 'disabled'));

UPDATE public.vendors v SET payout_account_status = 'pending'
WHERE payout_account_status = 'not_setup'
  AND EXISTS (SELECT 1 FROM public.vendor_payout_accounts a WHERE a.vendor_id = v.id);

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS payout_reminder_sent_at timestamptz;

ALTER TABLE public.vendor_payouts
  ADD COLUMN IF NOT EXISTS order_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_order_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bank_account_last4 text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS due_notified_at timestamptz;

-- Server-side helpers (not callable by clients).
CREATE OR REPLACE FUNCTION public.notify_vendor_members(_vendor_id uuid, _type text, _title text, _body text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
  SELECT user_id, 'order', _type, _title, _body, '/vendor?tab=payouts'
  FROM public.vendor_members WHERE vendor_id = _vendor_id;
$$;
REVOKE ALL ON FUNCTION public.notify_vendor_members(uuid, text, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.vendor_bank_last4(_vendor_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT right(regexp_replace(bank_account_number, '\s', '', 'g'), 4)
  FROM public.vendor_payout_accounts WHERE vendor_id = _vendor_id;
$$;
REVOKE ALL ON FUNCTION public.vendor_bank_last4(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.inr(_amount numeric)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT '₹' || to_char(round(_amount), 'FM99999999990');
$$;

-- Payout status rules: proof required, final states stay final.
CREATE OR REPLACE FUNCTION public.guard_vendor_payout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.bank_account_last4 := coalesce(NEW.bank_account_last4, public.vendor_bank_last4(NEW.vendor_id));
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'This payout is already %', CASE OLD.status WHEN 'paid' THEN 'credited' ELSE 'declined' END;
  END IF;

  IF NEW.status = 'paid' THEN
    IF coalesce(btrim(NEW.payment_reference), '') = '' THEN
      RAISE EXCEPTION 'Enter the bank transfer reference (UTR) to mark this payout credited';
    END IF;
    NEW.paid_at := coalesce(NEW.paid_at, now());
    NEW.bank_account_last4 := coalesce(public.vendor_bank_last4(NEW.vendor_id), NEW.bank_account_last4);
    NEW.failure_reason := NULL;
  ELSIF NEW.status = 'failed' THEN
    IF coalesce(btrim(NEW.failure_reason), '') = '' THEN
      RAISE EXCEPTION 'Enter why the bank declined the transfer';
    END IF;
    NEW.failed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_vendor_payout_trigger ON public.vendor_payouts;
CREATE TRIGGER guard_vendor_payout_trigger
  BEFORE INSERT OR UPDATE ON public.vendor_payouts
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_payout();

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
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_processing', 'Payout processing',
      format('We''ve started the bank transfer of %s for %s order(s) to your account%s.',
             public.inr(NEW.net_payable), NEW.order_count, v_acct));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'processing', 'payout_id', NEW.id));
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' THEN
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
    UPDATE public.vendor_orders
    SET payout_id = NULL, due_notified_at = coalesce(due_notified_at, now())
    WHERE payout_id = NEW.id;
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

DROP TRIGGER IF EXISTS vendor_payout_events_trigger ON public.vendor_payouts;
CREATE TRIGGER vendor_payout_events_trigger
  AFTER INSERT OR UPDATE OF status ON public.vendor_payouts
  FOR EACH ROW EXECUTE FUNCTION public.vendor_payout_events();

-- Bank details changed: back to "submitted" (a declined account becomes
-- payable again), confirm to the boutique - also a security alert if it
-- wasn't them - and tell admins, who make the transfers.
CREATE OR REPLACE FUNCTION public.vendor_payout_account_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last4 text := right(regexp_replace(NEW.bank_account_number, '\s', '', 'g'), 4);
  v_name text;
  v_admin uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.bank_account_number IS NOT DISTINCT FROM OLD.bank_account_number
     AND NEW.bank_ifsc IS NOT DISTINCT FROM OLD.bank_ifsc
     AND NEW.account_holder_name IS NOT DISTINCT FROM OLD.account_holder_name THEN
    RETURN NEW;
  END IF;

  UPDATE public.vendors SET payout_account_status = 'pending'
  WHERE id = NEW.vendor_id AND payout_account_status <> 'disabled'
  RETURNING name INTO v_name;

  PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_account_updated', 'Payout bank details updated',
    format('Payouts will now go to %s, account ending %s (IFSC %s). If you didn''t make this change, contact AllBoutiqs immediately.',
           NEW.account_holder_name, v_last4, NEW.bank_ifsc));

  FOR v_admin IN SELECT * FROM public.admin_user_ids() LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (v_admin, 'other', 'payout_account_updated', 'Boutique bank details changed',
            format('%s %s payout bank details (account ending %s).',
                   coalesce(v_name, 'A boutique'), CASE WHEN TG_OP = 'INSERT' THEN 'added' ELSE 'changed' END, v_last4),
            '/admin');
  END LOOP;

  PERFORM public.invoke_edge_function('send-vendor-payout-email',
    jsonb_build_object('event', 'account_updated', 'vendor_id', NEW.vendor_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_payout_account_changed_trigger ON public.vendor_payout_accounts;
CREATE TRIGGER vendor_payout_account_changed_trigger
  AFTER INSERT OR UPDATE ON public.vendor_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.vendor_payout_account_changed();

-- Orders payable on the delivery day were already announced as such, so
-- they don't get a separate "now in queue" alert.
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

-- Daily (09:00 IST): orders whose payout date arrived move to the queue -
-- one alert per boutique - and boutiques whose queued money can't be paid
-- (no bank details / declined account) are reminded every 7 days.
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
    SELECT vendor_id, array_agg(id) AS ids, sum(net_payable) AS total, count(*) AS n
    FROM public.vendor_orders
    WHERE status = 'delivered' AND payout_id IS NULL AND due_notified_at IS NULL
      AND payout_eligible_on IS NOT NULL AND payout_eligible_on <= v_today
    GROUP BY vendor_id
  LOOP
    SELECT payout_account_status INTO v_status FROM public.vendors WHERE id = r.vendor_id;
    v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = r.vendor_id);

    IF v_has_account AND v_status IN ('pending', 'active') THEN
      PERFORM public.notify_vendor_members(r.vendor_id, 'payout_queued', 'Payout ready - in queue',
        format('%s from %s order(s) finished its return window and is now in the queue for your next bank transfer.',
               public.inr(r.total), r.n));
    ELSE
      PERFORM public.notify_vendor_members(r.vendor_id, 'payout_account_missing', 'Payout ready - bank details needed',
        format('%s from %s order(s) is ready to pay, but %s. Update your payout details so we can send it.',
               public.inr(r.total), r.n,
               CASE WHEN v_status = 'needs_update' THEN 'your bank declined the last transfer'
                    ELSE 'your payout account is not set up' END));
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
      format('%s from %s order(s) is waiting to be paid. Add or fix your payout bank details so we can transfer it.',
             public.inr(r.total), r.n));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'account_reminder', 'vendor_id', r.vendor_id));
    UPDATE public.vendors SET payout_reminder_sent_at = now() WHERE id = r.vendor_id;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.process_vendor_payout_queue() FROM public, anon, authenticated;

SELECT cron.schedule(
  'process-vendor-payout-queue',
  '30 3 * * *',
  $$SELECT public.process_vendor_payout_queue();$$
);
