-- Return workflow: a request goes to the boutique first; if the boutique
-- doesn't accept or reject it within the admin-configured SLA, it escalates
-- to Admin automatically. Requests whose items span several boutiques (or
-- none) can't belong to one boutique, so they start with Admin.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS return_vendor_sla_hours integer NOT NULL DEFAULT 48
    CHECK (return_vendor_sla_hours BETWEEN 1 AND 720);

ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS handled_by text NOT NULL DEFAULT 'vendor'
    CHECK (handled_by IN ('vendor', 'admin')),
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_notes text;

-- Anything already in the system was handled under the old admin-only flow.
UPDATE public.return_requests SET handled_by = 'admin';

-- The one boutique all of a request's items belong to, or NULL.
CREATE OR REPLACE FUNCTION public.return_request_items_sole_vendor(_items jsonb)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN count(DISTINCT oi.vendor_id) = 1 AND bool_and(oi.vendor_id IS NOT NULL)
              THEN (array_agg(oi.vendor_id))[1] END
  FROM public.order_items oi
  WHERE oi.id IN (
    SELECT (elem->>'order_item_id')::uuid FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) AS elem
  );
$$;

CREATE OR REPLACE FUNCTION public.return_request_sole_vendor(_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.return_request_items_sole_vendor(items) FROM public.return_requests WHERE id = _request_id;
$$;

-- Routing is decided server-side on insert, never by the client.
CREATE OR REPLACE FUNCTION public.route_new_return_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.handled_by := CASE WHEN public.return_request_items_sole_vendor(NEW.items) IS NULL THEN 'admin' ELSE 'vendor' END;
  NEW.escalated_at := NULL;
  NEW.vendor_decision_at := NULL;
  NEW.vendor_notes := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS route_new_return_request_trigger ON public.return_requests;
CREATE TRIGGER route_new_return_request_trigger
  BEFORE INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.route_new_return_request();

-- New-request alert goes to whoever handles it first: the boutique, or the
-- admins when it starts with Admin. Admins hear about boutique requests on
-- escalation instead.
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
  v_sla integer;
BEGIN
  v_label := CASE WHEN NEW.request_type = 'exchange' THEN 'An exchange was requested' ELSE 'A return was requested' END;

  IF NEW.handled_by = 'vendor' THEN
    SELECT return_vendor_sla_hours INTO v_sla FROM public.platform_settings WHERE id;
    v_vendor_id := public.return_request_items_sole_vendor(NEW.items);
    FOR v_member_id IN SELECT user_id FROM public.vendor_members WHERE vendor_id = v_vendor_id LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (v_member_id, 'order', 'return_requested', v_label,
              format('%s - please accept or reject within %s hours, or it goes to the AllBoutiqs team.', NEW.reason, v_sla),
              '/vendor');
    END LOOP;
  ELSE
    FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (v_admin_id, 'order', 'return_requested', v_label, NEW.reason, '/admin');
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- The boutique's only write path: accept or reject its own pending request
-- while it's still with the boutique. Courier booking and the customer email
-- follow from the client exactly as for an admin decision.
CREATE OR REPLACE FUNCTION public.vendor_respond_to_return(_request_id uuid, _decision text, _note text DEFAULT NULL)
RETURNS public.return_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.return_requests;
  v_vendor uuid;
BEGIN
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  SELECT * INTO v_request FROM public.return_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return request not found';
  END IF;

  v_vendor := public.return_request_items_sole_vendor(v_request.items);
  IF v_vendor IS NULL OR NOT public.is_vendor_member(auth.uid(), v_vendor) THEN
    RAISE EXCEPTION 'You can only respond to return requests for your own boutique';
  END IF;
  IF v_request.handled_by <> 'vendor' THEN
    RAISE EXCEPTION 'This request has been escalated to the AllBoutiqs team';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been answered';
  END IF;

  UPDATE public.return_requests
  SET status = _decision,
      vendor_notes = nullif(trim(coalesce(_note, '')), ''),
      vendor_decision_at = now()
  WHERE id = _request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_respond_to_return(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendor_respond_to_return(uuid, text, text) TO authenticated;

-- Hand overdue boutique requests to Admin and tell both sides.
CREATE OR REPLACE FUNCTION public.escalate_overdue_return_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sla integer;
  v_row record;
  v_vendor uuid;
  v_member_id uuid;
  v_admin_id uuid;
  v_ref text;
BEGIN
  SELECT return_vendor_sla_hours INTO v_sla FROM public.platform_settings WHERE id;

  FOR v_row IN
    UPDATE public.return_requests
    SET handled_by = 'admin', escalated_at = now()
    WHERE handled_by = 'vendor'
      AND status = 'pending'
      AND created_at < now() - make_interval(hours => v_sla)
    RETURNING id, items, request_type
  LOOP
    v_ref := upper(left(v_row.id::text, 8));
    v_vendor := public.return_request_items_sole_vendor(v_row.items);

    FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (v_admin_id, 'order', 'return_escalated',
              format('%s request #%s escalated', initcap(v_row.request_type), v_ref),
              format('The boutique did not respond within %s hours. It now needs your decision.', v_sla),
              '/admin');
    END LOOP;

    FOR v_member_id IN SELECT user_id FROM public.vendor_members WHERE vendor_id = v_vendor LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (v_member_id, 'order', 'return_escalated',
              format('%s request #%s moved to AllBoutiqs', initcap(v_row.request_type), v_ref),
              format('No response within %s hours, so the AllBoutiqs team will decide this request.', v_sla),
              '/vendor');
    END LOOP;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'escalate-overdue-returns',
  '*/15 * * * *',
  $$SELECT public.escalate_overdue_return_requests();$$
);
