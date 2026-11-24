-- The Cash on Delivery "Order placed" bell said "pay ₹0 in cash" (order
-- #2ED5C0E8, 24 Nov 2026): it was written when the order row was saved, and
-- guard_new_order_payment saves every new order with 0 amounts - the
-- database prices it from its items a moment later (price_order), and
-- checkout may still drop it (abandon_checkout) if a price or the stock
-- moved. Now a COD order's notice goes out when its order-placed email is
-- claimed (orders.confirmation_email_sent_at set): checkout asks for that
-- email only once the order is priced and its stock taken. Online and wallet
-- orders stay on the payment going through, which comes after pricing.

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
  IF NEW.payment_method = 'cod' THEN
    IF NOT (OLD.confirmation_email_sent_at IS NULL AND NEW.confirmation_email_sent_at IS NOT NULL) THEN
      RETURN NULL;
    END IF;
  ELSIF NOT (NEW.payment_status = 'paid' AND OLD.payment_status NOT IN ('paid', 'refunded')) THEN
    RETURN NULL;
  END IF;
  -- Once per order (the email claim is undone and retried if sending fails).
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
DROP TRIGGER IF EXISTS notify_customer_order_placed_paid ON public.orders;
CREATE TRIGGER notify_customer_order_placed_paid
  AFTER UPDATE OF payment_status, confirmation_email_sent_at ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_order_placed();

-- The notices already sent with ₹0: the order's real amount.
UPDATE public.notifications n
SET body = format('Your order %s is placed - pay %s in cash when it arrives. We''ll let you know when the boutique confirms it.',
                  upper(public.order_ref(o.id)), public.inr(o.total))
FROM public.orders o
WHERE n.type = 'order_placed'
  AND n.link_url = '/orders?focus=' || o.id::text
  AND o.payment_method = 'cod'
  AND n.body LIKE '%pay ₹0 in cash%';
