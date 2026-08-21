-- Checkout now requires sign-in (enforced in the UI), so guest order
-- creation is retired at the RLS level too - otherwise anon could still
-- insert guest orders directly against the API even with the UI gate in
-- place. orders.user_id stays nullable (its FK's ON DELETE SET NULL still
-- needs that, and existing rows may already be null), it just no longer
-- has a path that lets a fresh anon insert set it to null.
DROP POLICY IF EXISTS "Guests can create orders" ON public.orders;
DROP POLICY IF EXISTS "Guests can create order items" ON public.order_items;
DROP POLICY IF EXISTS "Guests can create their payment record" ON public.payments;
DROP POLICY IF EXISTS "Guests create vendor orders at checkout" ON public.vendor_orders;

-- is_guest_order() had exactly these three policies as its only callers.
DROP FUNCTION IF EXISTS public.is_guest_order(uuid);
