-- Notifications open the exact page, tab and item they're about (for
-- admins, boutiques and customers): link_url carries ?tab= and ?focus=
-- (+ &sub= for nested admin tabs), which the frontend uses to switch tab and
-- open/highlight that order, return or payout. Mirrors
-- supabase/functions/_shared/notify.ts `links`. Also adds the order number
-- to messages, and customer notifications for their own orders.

CREATE OR REPLACE FUNCTION public.nlink(_path text, _tab text, _focus uuid DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _path || '?tab=' || _tab || coalesce('&focus=' || _focus::text, '');
$$;

CREATE OR REPLACE FUNCTION public.order_ref(_order_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '#' || left(_order_id::text, 8);
$$;

-- Payouts tab, scrolled to the payout bank details form.
CREATE OR REPLACE FUNCTION public.vendor_payout_account_link()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '/vendor?tab=payouts&focus=account';
$$;

-- Boutique bell with an explicit link (the 4-arg version keeps the Payouts
-- tab link used by payout alerts).
CREATE OR REPLACE FUNCTION public.notify_vendor_members(_vendor_id uuid, _type text, _title text, _body text, _link text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
  SELECT user_id, 'order', _type, _title, _body, _link
  FROM public.vendor_members WHERE vendor_id = _vendor_id;
$$;
REVOKE ALL ON FUNCTION public.notify_vendor_members(uuid, text, text, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_admins(_category text, _type text, _title text, _body text, _link text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
  SELECT a, _category, _type, _title, _body, _link FROM public.admin_user_ids() AS a;
$$;
REVOKE ALL ON FUNCTION public.notify_admins(text, text, text, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_customer(_order_id uuid, _type text, _title text, _body text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
  SELECT user_id, 'order', _type, _title, _body, '/orders?focus=' || _order_id::text
  FROM public.orders WHERE id = _order_id AND user_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.notify_customer(uuid, text, text, text) FROM public, anon, authenticated;

-- ---------- boutique / admin order alerts ----------

CREATE OR REPLACE FUNCTION public.notify_new_vendor_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_name text;
BEGIN
  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = NEW.vendor_id;
  PERFORM public.notify_vendor_members(NEW.vendor_id, 'new_order', 'New order received',
    format('Order %s (%s) is waiting to be confirmed.', public.order_ref(NEW.order_id), public.inr(NEW.net_payable)),
    public.nlink('/vendor', 'orders', NEW.id));
  PERFORM public.notify_admins('order', 'new_order', 'New order placed',
    format('Order %s for %s.', public.order_ref(NEW.order_id), coalesce(v_vendor_name, 'a boutique')),
    public.nlink('/admin', 'orders', NEW.id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_order_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_name text;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = NEW.vendor_id;
    PERFORM public.notify_admins('order', 'order_confirmed', 'Boutique confirmed an order',
      format('%s confirmed order %s.', coalesce(v_vendor_name, 'A boutique'), public.order_ref(NEW.order_id)),
      public.nlink('/admin', 'orders', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_order_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id uuid;
  v_vendor_name text;
BEGIN
  SELECT vendor_id INTO v_vendor_id FROM public.vendor_orders WHERE id = NEW.vendor_order_id;
  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_vendor_id;
  IF v_vendor_id IS NOT NULL THEN
    PERFORM public.notify_vendor_members(v_vendor_id, 'order_cancelled', 'An order was cancelled',
      format('Order %s was cancelled: %s', public.order_ref(NEW.order_id), coalesce(NEW.reason, 'no reason given')),
      public.nlink('/vendor', 'orders', NEW.vendor_order_id));
  END IF;
  PERFORM public.notify_admins('order', 'order_cancelled', 'An order was cancelled',
    format('Order %s (%s) - %s', public.order_ref(NEW.order_id), coalesce(v_vendor_name, 'a boutique'), coalesce(NEW.reason, 'no reason given')),
    public.nlink('/admin', 'cancelled', NEW.vendor_order_id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.remind_unconfirmed_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_vendor_name text;
BEGIN
  FOR v_row IN
    SELECT id, vendor_id, order_id FROM public.vendor_orders
    WHERE status = 'pending' AND created_at < now() - interval '2 hours' AND reminder_sent_at IS NULL
  LOOP
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_row.vendor_id;
    PERFORM public.notify_admins('order', 'unconfirmed_reminder', 'Order still unconfirmed after 2 hours',
      format('%s has not confirmed order %s, placed over 2 hours ago.', coalesce(v_vendor_name, 'A boutique'), public.order_ref(v_row.order_id)),
      public.nlink('/admin', 'orders', v_row.id));
    UPDATE public.vendor_orders SET reminder_sent_at = now() WHERE id = v_row.id;
  END LOOP;
END;
$$;

-- ---------- returns ----------

CREATE OR REPLACE FUNCTION public.notify_return_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
  v_sla integer;
BEGIN
  v_label := CASE WHEN NEW.request_type = 'exchange' THEN 'An exchange was requested' ELSE 'A return was requested' END;
  IF NEW.handled_by = 'vendor' THEN
    SELECT return_vendor_sla_hours INTO v_sla FROM public.platform_settings WHERE id;
    PERFORM public.notify_vendor_members(public.return_request_items_sole_vendor(NEW.items), 'return_requested', v_label,
      format('Order %s: %s - please accept or reject within %s hours, or it goes to the AllBoutiqs team.',
             public.order_ref(NEW.order_id), NEW.reason, v_sla),
      public.nlink('/vendor', 'returns', NEW.id));
  ELSE
    PERFORM public.notify_admins('order', 'return_requested', v_label,
      format('Order %s: %s', public.order_ref(NEW.order_id), NEW.reason),
      public.nlink('/admin', 'returns', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.escalate_overdue_return_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sla integer;
  v_row record;
BEGIN
  SELECT return_vendor_sla_hours INTO v_sla FROM public.platform_settings WHERE id;
  FOR v_row IN
    UPDATE public.return_requests
    SET handled_by = 'admin', escalated_at = now()
    WHERE handled_by = 'vendor' AND status = 'pending' AND created_at < now() - make_interval(hours => v_sla)
    RETURNING id, order_id, items, request_type
  LOOP
    PERFORM public.notify_admins('order', 'return_escalated',
      format('%s request for order %s escalated', initcap(v_row.request_type), public.order_ref(v_row.order_id)),
      format('The boutique did not respond within %s hours. It now needs your decision.', v_sla),
      public.nlink('/admin', 'returns', v_row.id));
    PERFORM public.notify_vendor_members(public.return_request_items_sole_vendor(v_row.items), 'return_escalated',
      format('%s request for order %s moved to AllBoutiqs', initcap(v_row.request_type), public.order_ref(v_row.order_id)),
      format('No response within %s hours, so the AllBoutiqs team will decide this request.', v_sla),
      public.nlink('/vendor', 'returns', v_row.id));
  END LOOP;
END;
$$;

-- ---------- payouts (focus the specific order on the Payouts tab) ----------

CREATE OR REPLACE FUNCTION public.notify_vendor_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_account boolean;
  v_hold integer;
  v_date text := to_char(NEW.payout_eligible_on, 'DD Mon YYYY');
BEGIN
  IF NOT (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered'
          AND OLD.payout_notified_at IS NULL AND NEW.payout_notified_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = NEW.vendor_id);
  v_hold := coalesce(public.vendor_order_payout_hold_days(NEW.id), 0);
  IF v_has_account THEN
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_scheduled', 'Order delivered - payout scheduled',
      format('Order %s was delivered. Your payout of %s is scheduled for %s %s.',
        public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date,
        CASE WHEN v_hold > 0 THEN format('(after the %s-day return window)', v_hold)
             ELSE '(non-returnable, so no return-window wait)' END),
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

CREATE OR REPLACE FUNCTION public.vendor_payout_account_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last4 text := right(regexp_replace(NEW.bank_account_number, '\s', '', 'g'), 4);
  v_name text;
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
           NEW.account_holder_name, v_last4, NEW.bank_ifsc),
    public.vendor_payout_account_link());
  PERFORM public.notify_admins('other', 'payout_account_updated', 'Boutique bank details changed',
    format('%s %s payout bank details (account ending %s).',
           coalesce(v_name, 'A boutique'), CASE WHEN TG_OP = 'INSERT' THEN 'added' ELSE 'changed' END, v_last4),
    public.nlink('/admin', 'vendor-payouts'));
  PERFORM public.invoke_edge_function('send-vendor-payout-email',
    jsonb_build_object('event', 'account_updated', 'vendor_id', NEW.vendor_id));
  RETURN NEW;
END;
$$;

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

-- ---------- customer notifications (link: My Orders, that order open) ----------

CREATE OR REPLACE FUNCTION public.notify_customer_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text := upper(public.order_ref(NEW.order_id));
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  CASE NEW.status
    WHEN 'confirmed' THEN
      IF OLD.status = 'pending' THEN
        PERFORM public.notify_customer(NEW.order_id, 'order_confirmed', 'Order confirmed',
          format('Your order %s was confirmed and is being prepared.', v_ref));
      END IF;
    WHEN 'shipped' THEN
      IF OLD.status IN ('pending', 'confirmed', 'processing') THEN
        PERFORM public.notify_customer(NEW.order_id, 'order_shipped', 'Order shipped',
          format('Your order %s is on its way.', v_ref));
      END IF;
    WHEN 'out_for_delivery' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_out_for_delivery', 'Out for delivery',
        format('Your order %s is out for delivery today.', v_ref));
    WHEN 'delivered' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_delivered', 'Order delivered',
        format('Your order %s was delivered. If something isn''t right, you can request a return or exchange from My Orders.', v_ref));
    WHEN 'cancelled' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_cancelled', 'Order cancelled',
        format('Your order %s was cancelled. Any online payment is refunded to your original payment method.', v_ref));
    WHEN 'ndr' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_delivery_failed', 'Delivery attempt failed',
        format('The courier couldn''t deliver your order %s. They will try again - please keep your phone reachable.', v_ref));
    WHEN 'returned' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_returned', 'Order returned to the boutique',
        format('Your order %s could not be delivered and went back to the boutique.', v_ref));
    ELSE
      NULL;
  END CASE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_customer_order_status_trigger ON public.vendor_orders;
CREATE TRIGGER notify_customer_order_status_trigger
  AFTER UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_order_status();

CREATE OR REPLACE FUNCTION public.notify_customer_return_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := CASE WHEN NEW.request_type = 'exchange' THEN 'exchange' ELSE 'return' END;
  v_ref text := upper(public.order_ref(NEW.order_id));
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  CASE NEW.status
    WHEN 'approved' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_approved', format('Your %s was approved', v_kind),
        format('Your %s request for order %s was approved. A courier will pick the items up.', v_kind, v_ref));
    WHEN 'rejected' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_rejected', format('Your %s request was declined', v_kind),
        format('Your %s request for order %s was declined%s.', v_kind, v_ref,
               coalesce(': ' || nullif(coalesce(NEW.vendor_notes, NEW.admin_notes), ''), '')));
    WHEN 'pickup_scheduled' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_pickup_scheduled', 'Pickup scheduled',
        format('A courier pickup is scheduled for your %s on order %s. Please keep the items packed and ready.', v_kind, v_ref));
    WHEN 'picked_up' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_picked_up', 'Items picked up',
        format('The courier picked up your %s for order %s.', v_kind, v_ref));
    WHEN 'completed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_completed', format('Your %s is complete', v_kind),
        format('Your %s for order %s is complete.%s', v_kind, v_ref,
               CASE WHEN v_kind = 'return' THEN ' Your refund is on its way.' ELSE ' Your replacement is on its way.' END));
    WHEN 'pickup_failed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_pickup_failed', 'Pickup couldn''t be completed',
        format('The courier couldn''t pick up your %s for order %s. Our team will reschedule it.', v_kind, v_ref));
    ELSE
      NULL;
  END CASE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_customer_return_status_trigger ON public.return_requests;
CREATE TRIGGER notify_customer_return_status_trigger
  AFTER UPDATE OF status ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_return_status();

CREATE OR REPLACE FUNCTION public.notify_customer_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'processed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'processed') THEN
    PERFORM public.notify_customer(NEW.order_id, 'refund_processed', 'Refund processed',
      format('%s for order %s was refunded to your original payment method. Banks usually show it within 5-7 working days.',
             public.inr(NEW.amount), upper(public.order_ref(NEW.order_id))));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_customer_refund_trigger ON public.refunds;
CREATE TRIGGER notify_customer_refund_trigger
  AFTER INSERT OR UPDATE OF status ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_refund();
