-- Every order step in the customer's bell (client, 24 Nov 2026: the bell
-- said "No order notifications yet" after an order was placed). Already
-- there: confirmed, at our centre, shipped, out for delivery, delivered,
-- delivery failed, cancelled, a Razorpay refund, return steps. New: order
-- placed, and a refund into the AllBoutiqs wallet. The confirmed notice now
-- reads "Confirmed by boutique" (the tracker's step), and the cancelled
-- notice no longer says "refunded to your original payment method" on a
-- Cash on Delivery order - each refund has its own notice.

-- ---------- Order placed ----------
-- Cash on Delivery: when the order is saved. Online / wallet: when the
-- payment goes through (the same moments as the order-placed email).
CREATE OR REPLACE FUNCTION public.notify_customer_order_placed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text := upper(public.order_ref(NEW.id));
BEGIN
  IF NEW.user_id IS NULL OR NEW.order_status = 'cancelled' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_method <> 'cod' THEN
      RETURN NULL;
    END IF;
  ELSIF NOT (NEW.payment_method <> 'cod' AND NEW.payment_status = 'paid'
             AND OLD.payment_status NOT IN ('paid', 'refunded')) THEN
    RETURN NULL;
  END IF;
  -- Once per order.
  IF EXISTS (SELECT 1 FROM public.notifications
             WHERE user_id = NEW.user_id AND type = 'order_placed' AND link_url = '/orders?focus=' || NEW.id::text) THEN
    RETURN NULL;
  END IF;
  PERFORM public.notify_customer(NEW.id, 'order_placed', 'Order placed',
    CASE WHEN NEW.payment_method = 'cod'
      THEN format('Your order %s is placed - pay %s in cash when it arrives. We''ll let you know when the boutique confirms it.', v_ref, public.inr(NEW.total))
      ELSE format('Your order %s is placed and paid. We''ll let you know when the boutique confirms it.', v_ref)
    END);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_customer_order_placed_insert ON public.orders;
CREATE TRIGGER notify_customer_order_placed_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_order_placed();
DROP TRIGGER IF EXISTS notify_customer_order_placed_paid ON public.orders;
CREATE TRIGGER notify_customer_order_placed_paid
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_order_placed();

-- ---------- Refund into the wallet ----------
CREATE OR REPLACE FUNCTION public.notify_customer_wallet_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind IN ('cancellation_refund', 'return_refund') AND NEW.amount > 0 AND NEW.order_id IS NOT NULL THEN
    PERFORM public.notify_customer(NEW.order_id, 'refund_to_wallet', 'Refund added to your wallet',
      format('%s for order %s was added to your AllBoutiqs wallet. You can use it on your next order.',
             public.inr(NEW.amount), upper(public.order_ref(NEW.order_id))));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_customer_wallet_refund_trigger ON public.wallet_transactions;
CREATE TRIGGER notify_customer_wallet_refund_trigger
  AFTER INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_wallet_refund();

-- ---------- Cancelled ----------
-- What a cancelled order's notice says about the money: nothing to pay on
-- Cash on Delivery; otherwise the refund follows in its own notice.
CREATE OR REPLACE FUNCTION public.customer_cancel_notice(_order_id uuid, _ref text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN o.payment_method = 'cod' THEN format('Your order %s was cancelled. There is nothing to pay.', _ref)
    WHEN o.payment_status IN ('paid', 'partially_refunded', 'refunded')
      THEN format('Your order %s was cancelled. Your refund is on its way - we''ll let you know when it''s done.', _ref)
    ELSE format('Your order %s was cancelled.', _ref)
  END
  FROM public.orders o WHERE o.id = _order_id;
$$;

-- notify_customer_order_status as live (20261015100000_unpaid_online_orders),
-- with the confirmed and cancelled wording above.
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
        format('Your order %s was delivered. If something isn''t right, you can request a return or exchange from My Orders.', v_ref));
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
