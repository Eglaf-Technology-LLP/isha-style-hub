-- Online checkouts whose payment never went through are not orders.
-- Checkout saves the order (and takes the stock) before Razorpay opens, so a
-- failed, cancelled or abandoned payment used to leave a "pending" order that
-- boutiques, the warehouse, admins and the customer all saw as real - with a
-- "New order received" alert - and its stock was never put back.
--
-- Now an order is "placed" once it is Cash on Delivery or its online payment
-- went through (order_is_placed). Until then boutiques and the warehouse
-- can't see it and nobody is told about it; when the payment goes through,
-- the boutiques and admins get the "New order" alert and the order emails go
-- out (once). A checkout left unpaid is released by release-unpaid-orders -
-- straight away when the customer closes the payment window, or after 30
-- minutes - once Razorpay confirms no payment came through: cancelled
-- quietly (no "order cancelled" message - there was no order), stock put
-- back, coupon use released.

-- ---------------------------------------------------------------------------
-- What counts as a placed order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_is_placed(_payment_method text, _payment_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(_payment_method = 'cod' OR _payment_status IN ('paid', 'refunded'), false);
$$;

CREATE OR REPLACE FUNCTION public.order_id_is_placed(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT public.order_is_placed(payment_method, payment_status) FROM public.orders WHERE id = _order_id), false);
$$;

-- ---------------------------------------------------------------------------
-- Boutiques and the warehouse only see placed orders (admins and the
-- customer still see everything of theirs)
-- ---------------------------------------------------------------------------
ALTER POLICY "Vendor members and admins view vendor orders" ON public.vendor_orders
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR (public.is_vendor_member(auth.uid(), vendor_id) AND public.order_id_is_placed(order_id)));
ALTER POLICY "Warehouse views vendor orders" ON public.vendor_orders
  USING (public.can_operate_warehouse(auth.uid()) AND public.order_id_is_placed(order_id));
ALTER POLICY "Vendor members can view their order items" ON public.order_items
  USING (public.is_vendor_member(auth.uid(), vendor_id) AND public.order_id_is_placed(order_id));
ALTER POLICY "Warehouse views order items" ON public.order_items
  USING (public.can_operate_warehouse(auth.uid()) AND public.order_id_is_placed(order_id));
ALTER POLICY "Vendor members can view orders containing their sales" ON public.orders
  USING (public.order_contains_vendor_sale(id, auth.uid()) AND public.order_is_placed(payment_method, payment_status));
ALTER POLICY "Warehouse views orders" ON public.orders
  USING (public.can_operate_warehouse(auth.uid()) AND public.order_is_placed(payment_method, payment_status));

-- ---------------------------------------------------------------------------
-- "New order" alerts only for placed orders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.announce_vendor_order(_vendor_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vo record;
  v_vendor_name text;
BEGIN
  SELECT id, vendor_id, order_id, net_payable INTO vo FROM public.vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = vo.vendor_id;
  PERFORM public.notify_vendor_members(vo.vendor_id, 'new_order', 'New order received',
    format('Order %s (%s) is waiting to be confirmed.', public.order_ref(vo.order_id), public.inr(vo.net_payable)),
    public.nlink('/vendor', 'orders', vo.id));
  PERFORM public.notify_admins('order', 'new_order', 'New order placed',
    format('Order %s for %s.', public.order_ref(vo.order_id), coalesce(v_vendor_name, 'a boutique')),
    public.nlink('/admin', 'orders', vo.id));
END;
$$;
REVOKE ALL ON FUNCTION public.announce_vendor_order(uuid) FROM public, anon, authenticated;

-- Insert of a boutique's part: announced now for Cash on Delivery; an online
-- order waits for its payment (announce_paid_online_order).
CREATE OR REPLACE FUNCTION public.notify_new_vendor_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.order_id_is_placed(NEW.order_id) THEN
    PERFORM public.announce_vendor_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Online payment went through: announce each boutique's part and send the
-- order emails (each email goes out once, however many paths ask for it).
CREATE OR REPLACE FUNCTION public.announce_paid_online_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
BEGIN
  IF NEW.payment_method <> 'cod' AND NEW.payment_status = 'paid'
     AND OLD.payment_status NOT IN ('paid', 'refunded') AND NEW.order_status <> 'cancelled' THEN
    FOR v IN SELECT id FROM public.vendor_orders WHERE order_id = NEW.id AND status <> 'cancelled' LOOP
      PERFORM public.announce_vendor_order(v.id);
    END LOOP;
    PERFORM public.invoke_edge_function('send-order-email', jsonb_build_object('orderId', NEW.id, 'type', 'confirmation'));
    PERFORM public.invoke_edge_function('send-vendor-order-email', jsonb_build_object('orderId', NEW.id));
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS announce_paid_online_order_trigger ON public.orders;
CREATE TRIGGER announce_paid_online_order_trigger
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.announce_paid_online_order();

-- Admins are only chased about real orders.
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
      AND public.order_id_is_placed(order_id)
  LOOP
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_row.vendor_id;
    PERFORM public.notify_admins('order', 'unconfirmed_reminder', 'Order still unconfirmed after 2 hours',
      format('%s has not confirmed order %s, placed over 2 hours ago.', coalesce(v_vendor_name, 'A boutique'), public.order_ref(v_row.order_id)),
      public.nlink('/admin', 'orders', v_row.id));
    UPDATE public.vendor_orders SET reminder_sent_at = now() WHERE id = v_row.id;
  END LOOP;
END;
$$;

-- Each order email goes out once (checkout, verify, webhook and the trigger
-- above may all ask).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_email_sent_at timestamptz;
-- Orders placed before this already had their emails.
UPDATE public.orders
SET confirmation_email_sent_at = created_at, vendor_email_sent_at = created_at
WHERE public.order_is_placed(payment_method, payment_status) AND confirmation_email_sent_at IS NULL;

-- ---------------------------------------------------------------------------
-- Releasing a checkout that was never paid
-- ---------------------------------------------------------------------------
-- Cancel quietly, put back every unit it took, release its coupon use and
-- drop any "new order" alert sent for it. Never touches a paid order.
-- Returns true when it cancelled the order now.
CREATE OR REPLACE FUNCTION public.abandon_checkout(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  it record;
  v_was_open boolean;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.payment_status IN ('paid', 'refunded') THEN
    RETURN false;
  END IF;
  v_was_open := o.order_status <> 'cancelled';

  PERFORM set_config('app.unpaid_checkout_release', 'on', true);
  UPDATE public.vendor_orders SET status = 'cancelled' WHERE order_id = o.id AND status <> 'cancelled';
  UPDATE public.orders
  SET order_status = 'cancelled',
      payment_status = CASE WHEN payment_method <> 'cod' AND payment_status = 'pending' THEN 'failed' ELSE payment_status END
  WHERE id = o.id;
  UPDATE public.payments SET payment_status = 'failed' WHERE order_id = o.id AND payment_status = 'pending' AND o.payment_method <> 'cod';
  PERFORM set_config('app.unpaid_checkout_release', 'off', true);

  -- Whatever stock the checkout took and nothing has given back yet.
  FOR it IN
    SELECT product_id, variant_id, sum(change_quantity) AS net
    FROM public.stock_movements WHERE reference_order_id = o.id
    GROUP BY product_id, variant_id HAVING sum(change_quantity) < 0
  LOOP
    PERFORM public.adjust_stock(it.product_id, it.variant_id, (-it.net)::integer, 'return',
      'Payment not completed - stock released', o.id);
  END LOOP;

  IF v_was_open AND o.discount_code IS NOT NULL THEN
    UPDATE public.discounts SET used_count = used_count - 1
    WHERE upper(code) = upper(o.discount_code) AND used_count > 0;
  END IF;

  DELETE FROM public.notifications n
  WHERE n.type = 'new_order'
    AND EXISTS (SELECT 1 FROM public.vendor_orders vo WHERE vo.order_id = o.id AND n.link_url LIKE '%' || vo.id::text || '%');

  RETURN v_was_open;
END;
$$;
REVOKE ALL ON FUNCTION public.abandon_checkout(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_checkout(uuid) TO service_role;

-- Checkout's own clean-up when it fails part-way (stock ran out, items
-- couldn't be saved). Was callable by anyone on any pending order and left
-- the stock taken; now only the customer, only on their own unpaid checkout
-- from the last half hour that no boutique has started on.
CREATE OR REPLACE FUNCTION public.cancel_pending_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = _order_id AND o.user_id = auth.uid() AND o.order_status = 'pending'
      AND o.payment_status NOT IN ('paid', 'refunded')
      AND o.created_at > now() - interval '30 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.vendor_orders vo WHERE vo.order_id = o.id AND vo.status NOT IN ('pending', 'cancelled'))
  ) THEN
    PERFORM public.abandon_checkout(_order_id);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_pending_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_pending_order(uuid) TO authenticated;

-- Every 10 minutes: release online checkouts left unpaid for 30 minutes
-- (release-unpaid-orders asks Razorpay first).
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'release-unpaid-orders';
SELECT cron.schedule('release-unpaid-orders', '*/10 * * * *', $$SELECT public.invoke_edge_function('release-unpaid-orders', '{}'::jsonb);$$);

-- ---------------------------------------------------------------------------
-- Customer status messages: silent while an unpaid checkout is released
-- (otherwise as before)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_customer_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
          PERFORM public.notify_customer(NEW.order_id, 'order_confirmed', 'Order confirmed',
            format('Your order %s was confirmed and is being prepared.', v_ref));
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
            format('Your order %s was delivered. If something isn''t right, you can request a return or exchange from My Orders.', v_ref));
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
          format('Your order %s was cancelled. Any online payment is refunded to your original payment method.', v_ref));
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
        PERFORM public.notify_customer(NEW.order_id, 'order_confirmed', 'Order confirmed',
          format('Your order %s was confirmed and is being prepared.', v_ref));
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
        format('Your order %s was delivered. If something isn''t right, you can request a return or exchange from My Orders.', v_ref));
      v_email := 'delivered';
    WHEN 'cancelled' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_cancelled', 'Order cancelled',
        format('Your order %s was cancelled. Any online payment is refunded to your original payment method.', v_ref));
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

-- ---------------------------------------------------------------------------
-- Statements list placed orders only (otherwise as in step 11)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.statement_lines(_vendor_id uuid, _from date, _to date)
RETURNS TABLE (
  vendor_id uuid,
  boutique_code text,
  boutique_name text,
  vendor_order_id uuid,
  order_number text,
  order_date date,
  delivered_on date,
  status text,
  payment_method text,
  supply_type text,
  goods_value numeric,
  product_value numeric,
  gst numeric,
  commission numeric,
  tech_fee numeric,
  fee_gst numeric,
  gateway_fee numeric,
  courier numeric,
  cod_charge numeric,
  refunded numeric,
  net_taxable numeric,
  tcs_rate numeric,
  tcs_cgst numeric,
  tcs_sgst numeric,
  tcs_igst numeric,
  tds_rate numeric,
  tds numeric,
  net_payout numeric,
  payout_status text,
  payment_date date,
  utr text,
  fee_invoice_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT (_vendor_id IS NOT NULL AND public.is_vendor_member(auth.uid(), _vendor_id))
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'You can only download your own statement';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT vo.*, o.created_at AS order_created, o.payment_method AS pay_method,
           v.boutique_code AS bcode, v.name AS bname,
           vp.paid_at AS manual_paid_at, vp.payment_reference AS manual_utr,
           fi.invoice_number AS fee_inv
    FROM vendor_orders vo
    JOIN orders o ON o.id = vo.order_id
    JOIN vendors v ON v.id = vo.vendor_id
    LEFT JOIN vendor_payouts vp ON vp.id = vo.payout_id
    LEFT JOIN fee_invoices fi ON fi.id = vo.fee_invoice_id
    WHERE (_vendor_id IS NULL OR vo.vendor_id = _vendor_id)
      AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
      AND public.order_is_placed(o.payment_method, o.payment_status)
  ),
  -- Refunds that reached the customer, per boutique order: cancellations
  -- directly; returns shared across their items' boutique orders by value.
  cancel_refunds AS (
    SELECT oc.vendor_order_id AS vo_id, sum(r.amount) AS amt
    FROM order_cancellations oc JOIN refunds r ON r.id = oc.refund_id
    WHERE r.status = 'processed' AND oc.vendor_order_id IN (SELECT id FROM base)
    GROUP BY oc.vendor_order_id
  ),
  return_items AS (
    SELECT r.id AS refund_id, r.amount, oi.vendor_order_id AS vo_id,
           oi.price * coalesce((elem->>'quantity')::int, oi.quantity) AS item_value
    FROM refunds r
    JOIN return_requests rr ON rr.id = r.return_request_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(rr.items, '[]'::jsonb)) AS elem
    JOIN order_items oi ON oi.id = (elem->>'order_item_id')::uuid
    WHERE r.status = 'processed' AND oi.vendor_order_id IN (SELECT id FROM base)
  ),
  return_refunds AS (
    SELECT ri.vo_id, sum(ri.amount * ri.item_value / nullif(t.total_value, 0)) AS amt
    FROM return_items ri
    JOIN (SELECT refund_id, sum(item_value) AS total_value FROM return_items GROUP BY refund_id) t ON t.refund_id = ri.refund_id
    GROUP BY ri.vo_id
  ),
  calc AS (
    SELECT b.*,
           round(coalesce(cr.amt, 0) + coalesce(rf.amt, 0), 2) AS refunded_amt,
           (b.status = 'cancelled') AS is_cancelled
    FROM base b
    LEFT JOIN cancel_refunds cr ON cr.vo_id = b.id
    LEFT JOIN return_refunds rf ON rf.vo_id = b.id
  ),
  taxed AS (
    SELECT c.*,
           CASE WHEN c.is_cancelled THEN 0
                ELSE greatest(0, c.product_value - CASE WHEN c.goods_value > 0
                     THEN round(least(c.refunded_amt, c.goods_value) * c.product_value / c.goods_value, 2) ELSE 0 END)
           END AS net_tax
    FROM calc c
  )
  SELECT t.vendor_id, t.bcode, t.bname, t.id,
         '#' || upper(left(t.order_id::text, 8)),
         (t.order_created AT TIME ZONE 'Asia/Kolkata')::date,
         (t.delivered_at AT TIME ZONE 'Asia/Kolkata')::date,
         t.status, t.pay_method, t.supply_type,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.goods_value END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.product_value END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.goods_gst END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.commission_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.tech_fee_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.fee_gst_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.gateway_fee_amount END,
         t.courier_charge, t.cod_handling_charge, t.refunded_amt, t.net_tax,
         t.tcs_rate,
         CASE WHEN t.supply_type = 'intra_state' THEN round(t.net_tax * t.tcs_rate / 200, 2) ELSE 0 END,
         CASE WHEN t.supply_type = 'intra_state' THEN round(t.net_tax * t.tcs_rate / 100, 2) - round(t.net_tax * t.tcs_rate / 200, 2) ELSE 0 END,
         CASE WHEN t.supply_type = 'intra_state' THEN 0 ELSE round(t.net_tax * t.tcs_rate / 100, 2) END,
         t.tds_rate,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.tds_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.net_payable END,
         CASE WHEN coalesce(t.rzp_settled_at, t.manual_paid_at) IS NOT NULL THEN 'paid'
              WHEN t.rzp_transfer_status = 'released' THEN 'sent'
              ELSE 'pending' END,
         (coalesce(t.rzp_settled_at, t.manual_paid_at) AT TIME ZONE 'Asia/Kolkata')::date,
         coalesce(t.rzp_settlement_utr, t.manual_utr),
         t.fee_inv
  FROM taxed t
  ORDER BY t.order_created, t.bname;
END;
$$;
REVOKE ALL ON FUNCTION public.statement_lines(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.statement_lines(uuid, date, date) TO authenticated;
