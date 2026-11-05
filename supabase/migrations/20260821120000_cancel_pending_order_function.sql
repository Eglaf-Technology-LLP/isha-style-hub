-- orders has zero UPDATE policies for any client role (confirmed: not even
-- the customer who placed it can update their own order directly) - so
-- Checkout.tsx's plan to cancel an order when a post-insert stock check
-- fails was silently doing nothing under RLS (no error, 0 rows affected).
-- Scoped narrowly to pending orders only, so it can't be used to alter an
-- order that's already moved on to payment/fulfillment.
CREATE OR REPLACE FUNCTION public.cancel_pending_order(_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET order_status = 'cancelled'
  WHERE id = _order_id AND order_status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_pending_order(uuid) TO anon, authenticated;
