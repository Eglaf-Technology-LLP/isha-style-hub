-- Report a problem (client, 27 Nov 2026). Damage or a wrong item found
-- after delivery is not a cancellation: for 24 hours from delivery the
-- customer's order shows "Report a problem" (unboxing video + photos
-- compulsory, a reason and a note). The customer gets a ticket number by
-- email; the admins and the boutique get a bell + email at once. After 24
-- hours the button hides and nothing late is taken (the user's decision,
-- 27 Nov 2026: no admin override).
--
-- Written only by the report-order-problem edge function (service role),
-- which checks the order, the 24 hours and the evidence. The customer, the
-- admins and the boutiques whose pieces it is about can read it; admins
-- mark it resolved.
--
-- Also: the "Order delivered" bell now carries the 24-hour unboxing rule.

CREATE TABLE IF NOT EXISTS public.problem_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- PRB-261127-K7Q4X (day in India time + 5 characters).
  ticket text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- The pieces it is about, as they were on the order:
  -- [{order_item_id, vendor_order_id, vendor_id, product_title, size, color, quantity}]
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  vendor_order_ids uuid[] NOT NULL,
  -- The boutiques of those pieces (each sees the report).
  vendor_ids uuid[] NOT NULL,
  reason text NOT NULL CHECK (reason IN ('damaged', 'wrong_item', 'missing_item', 'measurement_off', 'other')),
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 2000),
  -- The unboxing video and the photos (the customer's own upload folder).
  video_url text NOT NULL CHECK (char_length(video_url) BETWEEN 1 AND 1000),
  photo_urls text[] NOT NULL CHECK (cardinality(photo_urls) BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  -- What the admin did about it.
  admin_note text CHECK (char_length(admin_note) <= 2000),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- When each email went out (null = it didn't, e.g. the mail server was down).
  customer_emailed_at timestamptz,
  admins_emailed_at timestamptz,
  boutiques_emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.problem_reports IS
  'Report a problem: damage / wrong / missing item or measurement off, reported within 24 hours of delivery with an unboxing video and photos. Written by the report-order-problem edge function.';

CREATE INDEX IF NOT EXISTS idx_problem_reports_order ON public.problem_reports (order_id);
CREATE INDEX IF NOT EXISTS idx_problem_reports_created ON public.problem_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_problem_reports_vendor_ids ON public.problem_reports USING gin (vendor_ids);

ALTER TABLE public.problem_reports ENABLE ROW LEVEL SECURITY;

-- Reads go through RLS; only an admin's resolve (status + note) is a write.
REVOKE ALL ON public.problem_reports FROM anon, authenticated;
GRANT SELECT ON public.problem_reports TO authenticated;
GRANT UPDATE (status, admin_note) ON public.problem_reports TO authenticated;

DROP POLICY IF EXISTS "Customers view their own problem reports" ON public.problem_reports;
CREATE POLICY "Customers view their own problem reports"
  ON public.problem_reports FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Boutiques view problem reports about their pieces" ON public.problem_reports;
CREATE POLICY "Boutiques view problem reports about their pieces"
  ON public.problem_reports FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_members m
    WHERE m.user_id = auth.uid() AND m.vendor_id = ANY (problem_reports.vendor_ids)
  ));

DROP POLICY IF EXISTS "Admins view problem reports" ON public.problem_reports;
CREATE POLICY "Admins view problem reports"
  ON public.problem_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins resolve problem reports" ON public.problem_reports;
CREATE POLICY "Admins resolve problem reports"
  ON public.problem_reports FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Who resolved it and when, stamped here (not trusted from the browser).
CREATE OR REPLACE FUNCTION public.stamp_problem_report_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN
    NEW.resolved_at := now();
    NEW.resolved_by := auth.uid();
  ELSIF NEW.status = 'open' THEN
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_problem_report_update_trigger ON public.problem_reports;
CREATE TRIGGER stamp_problem_report_update_trigger
  BEFORE UPDATE ON public.problem_reports
  FOR EACH ROW EXECUTE FUNCTION public.stamp_problem_report_update();

-- ---------- "Order delivered" bell: the 24-hour unboxing rule ----------
-- Same words as UNBOXING_RULE in src/lib/problemReport.ts (also at checkout,
-- in the delivered email and on the warehouse packing slip).
CREATE OR REPLACE FUNCTION public.customer_delivered_notice(_ref text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT format('Your order %s was delivered. Please open your parcel within 24 hours of delivery and record an unboxing video – report any problem in My orders › Report a problem.', _ref);
$$;

-- notify_customer_order_status as in 20261124120000_customer_order_bell,
-- with the delivered notice above.
CREATE OR REPLACE FUNCTION public.notify_customer_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_ref text := upper(public.order_ref(NEW.order_id));
  v_email text;
  v_route text;
BEGIN
  -- Releasing an unpaid checkout (abandon_checkout): there was no order to
  -- tell the customer about.
  IF current_setting('app.unpaid_checkout_release', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT fulfilment_route INTO v_route FROM public.orders WHERE id = NEW.order_id;

  IF v_route = 'warehouse' THEN
    CASE NEW.status
      WHEN 'confirmed' THEN
        -- Once per order: the first boutique to confirm.
        IF OLD.status = 'pending' AND NOT EXISTS (
          SELECT 1 FROM public.vendor_orders s
          WHERE s.order_id = NEW.order_id AND s.id <> NEW.id AND s.status NOT IN ('pending', 'cancelled')) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_confirmed', 'Confirmed by boutique',
            format('The boutique confirmed your order %s and is preparing it.', v_ref));
          v_email := 'confirmed';
        END IF;
      WHEN 'at_warehouse' THEN
        -- Once every part has reached the warehouse (not on a parcel coming back).
        IF OLD.status <> 'returned' AND NOT EXISTS (
          SELECT 1 FROM public.vendor_orders s
          WHERE s.order_id = NEW.order_id AND s.id <> NEW.id
            AND s.status IN ('pending', 'confirmed', 'processing', 'in_transit_to_warehouse')) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_at_warehouse', 'At our quality-check centre',
            format('Your order %s reached our quality-check centre. We''ll check and pack it, then send it to you.', v_ref));
        END IF;
      WHEN 'shipped' THEN
        IF NEW.dispatch_id IS NOT NULL AND NEW.id = public.dispatch_lead_vendor_order(NEW.dispatch_id) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_shipped', 'Order shipped',
            format('Your order %s was packed and is on its way.', v_ref));
          v_email := 'shipped';
        END IF;
      WHEN 'out_for_delivery' THEN
        IF NEW.dispatch_id IS NOT NULL AND NEW.id = public.dispatch_lead_vendor_order(NEW.dispatch_id) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_out_for_delivery', 'Out for delivery',
            format('Your order %s is out for delivery today.', v_ref));
          v_email := 'out_for_delivery';
        END IF;
      WHEN 'delivered' THEN
        IF NEW.dispatch_id IS NOT NULL AND NEW.id = public.dispatch_lead_vendor_order(NEW.dispatch_id) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_delivered', 'Order delivered',
            public.customer_delivered_notice(v_ref));
          v_email := 'delivered';
        END IF;
      WHEN 'ndr' THEN
        IF NEW.dispatch_id IS NOT NULL AND NEW.id = public.dispatch_lead_vendor_order(NEW.dispatch_id) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_delivery_failed', 'Delivery attempt failed',
            format('The courier couldn''t deliver your order %s. They will try again - please keep your phone reachable.', v_ref));
          v_email := 'delivery_failed';
        END IF;
      WHEN 'returned' THEN
        IF NEW.dispatch_id IS NOT NULL AND NEW.id = public.dispatch_lead_vendor_order(NEW.dispatch_id) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_returned', 'Order could not be delivered',
            format('Your order %s could not be delivered and is coming back to us. Our team will contact you.', v_ref));
        END IF;
      WHEN 'cancelled' THEN
        PERFORM public.notify_customer(NEW.order_id, 'order_cancelled', 'Order cancelled',
          public.customer_cancel_notice(NEW.order_id, v_ref));
      ELSE
        NULL;
    END CASE;

    IF v_email IS NOT NULL THEN
      PERFORM public.invoke_edge_function('send-order-email',
        jsonb_build_object('orderId', NEW.order_id, 'type', v_email, 'vendorOrderId', NEW.id, 'dispatchId', NEW.dispatch_id));
    END IF;
    RETURN NEW;
  END IF;

  CASE NEW.status
    WHEN 'confirmed' THEN
      IF OLD.status = 'pending' THEN
        PERFORM public.notify_customer(NEW.order_id, 'order_confirmed', 'Confirmed by boutique',
          format('The boutique confirmed your order %s and is preparing it.', v_ref));
        v_email := 'confirmed';
      END IF;
    WHEN 'shipped' THEN
      IF OLD.status IN ('pending', 'confirmed', 'processing') THEN
        PERFORM public.notify_customer(NEW.order_id, 'order_shipped', 'Order shipped',
          format('Your order %s is on its way.', v_ref));
        v_email := 'shipped';
      END IF;
    WHEN 'out_for_delivery' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_out_for_delivery', 'Out for delivery',
        format('Your order %s is out for delivery today.', v_ref));
      v_email := 'out_for_delivery';
    WHEN 'delivered' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_delivered', 'Order delivered',
        public.customer_delivered_notice(v_ref));
      v_email := 'delivered';
    WHEN 'cancelled' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_cancelled', 'Order cancelled',
        public.customer_cancel_notice(NEW.order_id, v_ref));
    WHEN 'ndr' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_delivery_failed', 'Delivery attempt failed',
        format('The courier couldn''t deliver your order %s. They will try again - please keep your phone reachable.', v_ref));
      v_email := 'delivery_failed';
    WHEN 'returned' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_returned', 'Order returned to the boutique',
        format('Your order %s could not be delivered and went back to the boutique.', v_ref));
    ELSE
      NULL;
  END CASE;

  IF v_email IS NOT NULL THEN
    PERFORM public.invoke_edge_function('send-order-email',
      jsonb_build_object('orderId', NEW.order_id, 'type', v_email, 'vendorOrderId', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
