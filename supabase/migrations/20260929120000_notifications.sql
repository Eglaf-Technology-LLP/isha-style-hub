-- Two-area notification system: "order" (new order, cancellation, return,
-- vendor confirmation, unconfirmed-order reminder) and "other" (a general
-- bucket for everything else, currently empty but wired and ready). Rows
-- are per-recipient, not per-event - a new order with 2 vendor items and
-- 1 admin produces up to 3 rows (one per vendor member, one per admin),
-- so each person's own unread count and mark-as-read state is independent.
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('order', 'other')),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link_url text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_id_created_at ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only mark-as-read (via read_at) is client-writable - the row's
-- existence/content is always system-generated (trigger or cron below),
-- same lockdown pattern as payments.payment_status.
CREATE POLICY "Users mark their own notifications read"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2-hour "still not confirmed" reminder needs a per-vendor_order marker so
-- the periodic check (below) never sends the same reminder twice.
ALTER TABLE public.vendor_orders ADD COLUMN reminder_sent_at timestamptz;

-- Shared helper: every admin's user_id, for notifications that go to the
-- whole admin team rather than one person.
CREATE OR REPLACE FUNCTION public.admin_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.user_roles WHERE role = 'admin';
$$;

-- 1. New order - one notification per vendor_order, fanned out to every
-- member of that vendor plus every admin.
CREATE OR REPLACE FUNCTION public.notify_new_vendor_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_name text;
  v_member_id uuid;
  v_admin_id uuid;
BEGIN
  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = NEW.vendor_id;

  FOR v_member_id IN SELECT user_id FROM public.vendor_members WHERE vendor_id = NEW.vendor_id LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (
      v_member_id, 'order', 'new_order',
      'New order received',
      format('A new order (₹%s) is waiting to be confirmed.', NEW.net_payable),
      '/vendor'
    );
  END LOOP;

  FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (
      v_admin_id, 'order', 'new_order',
      'New order placed',
      format('New order for %s.', coalesce(v_vendor_name, 'a vendor')),
      '/admin'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_vendor_order_trigger ON public.vendor_orders;
CREATE TRIGGER notify_new_vendor_order_trigger
  AFTER INSERT ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_vendor_order();

-- 2. Vendor confirms an order (pending -> confirmed) - admin gets notified
-- that the boutique acted on it.
CREATE OR REPLACE FUNCTION public.notify_order_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_name text;
  v_admin_id uuid;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = NEW.vendor_id;
    FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (
        v_admin_id, 'order', 'order_confirmed',
        'Vendor confirmed an order',
        format('%s confirmed an order.', coalesce(v_vendor_name, 'A vendor')),
        '/admin'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_order_confirmed_trigger ON public.vendor_orders;
CREATE TRIGGER notify_order_confirmed_trigger
  AFTER UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_confirmed();

-- 3. Cancellation - notify the affected vendor's team and every admin.
CREATE OR REPLACE FUNCTION public.notify_order_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id uuid;
  v_vendor_name text;
  v_member_id uuid;
  v_admin_id uuid;
BEGIN
  SELECT vendor_id INTO v_vendor_id FROM public.vendor_orders WHERE id = NEW.vendor_order_id;
  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_vendor_id;

  IF v_vendor_id IS NOT NULL THEN
    FOR v_member_id IN SELECT user_id FROM public.vendor_members WHERE vendor_id = v_vendor_id LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (
        v_member_id, 'order', 'order_cancelled',
        'An order was cancelled',
        NEW.reason,
        '/vendor'
      );
    END LOOP;
  END IF;

  FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (
      v_admin_id, 'order', 'order_cancelled',
      'An order was cancelled',
      format('%s - %s', coalesce(v_vendor_name, 'A vendor'), coalesce(NEW.reason, 'no reason given')),
      '/admin'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_order_cancellation_trigger ON public.order_cancellations;
CREATE TRIGGER notify_order_cancellation_trigger
  AFTER INSERT ON public.order_cancellations
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_cancellation();

-- 4. Return/exchange requested - return_requests.items is a JSON snapshot
-- of order_item_ids, not a live FK (same shape useReturnRequests.ts
-- already resolves client-side), so the affected vendor(s) are resolved
-- the same way here: join through order_items.
CREATE OR REPLACE FUNCTION public.notify_return_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id uuid;
  v_member_id uuid;
  v_admin_id uuid;
  v_label text;
BEGIN
  v_label := CASE WHEN NEW.request_type = 'exchange' THEN 'An exchange was requested' ELSE 'A return was requested' END;

  FOR v_vendor_id IN
    SELECT DISTINCT oi.vendor_id
    FROM public.order_items oi
    WHERE oi.id IN (
      SELECT (elem->>'order_item_id')::uuid
      FROM jsonb_array_elements(NEW.items) AS elem
    )
    AND oi.vendor_id IS NOT NULL
  LOOP
    FOR v_member_id IN SELECT user_id FROM public.vendor_members WHERE vendor_id = v_vendor_id LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (v_member_id, 'order', 'return_requested', v_label, NEW.reason, '/vendor');
    END LOOP;
  END LOOP;

  FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (v_admin_id, 'order', 'return_requested', v_label, NEW.reason, '/admin');
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_return_request_trigger ON public.return_requests;
CREATE TRIGGER notify_return_request_trigger
  AFTER INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_return_request();

-- 5. "Still unconfirmed after 2 hours" - time-based, not event-driven, so
-- this is the one piece that genuinely needs a scheduler rather than a
-- trigger. reminder_sent_at guards against sending the same reminder
-- again on every cron tick.
CREATE OR REPLACE FUNCTION public.remind_unconfirmed_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_vendor_name text;
  v_admin_id uuid;
BEGIN
  FOR v_row IN
    SELECT id, vendor_id, order_id
    FROM public.vendor_orders
    WHERE status = 'pending'
      AND created_at < now() - interval '2 hours'
      AND reminder_sent_at IS NULL
  LOOP
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_row.vendor_id;
    FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (
        v_admin_id, 'order', 'unconfirmed_reminder',
        'Order still unconfirmed after 2 hours',
        format('%s has not confirmed an order placed over 2 hours ago.', coalesce(v_vendor_name, 'A vendor')),
        '/admin'
      );
    END LOOP;
    UPDATE public.vendor_orders SET reminder_sent_at = now() WHERE id = v_row.id;
  END LOOP;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'remind-unconfirmed-orders',
  '*/15 * * * *',
  $$SELECT public.remind_unconfirmed_orders();$$
);
