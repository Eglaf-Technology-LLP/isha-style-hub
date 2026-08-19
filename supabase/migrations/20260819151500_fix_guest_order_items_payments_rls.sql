-- The guest-facing INSERT policies on order_items/payments (added in the
-- previous migration) check `EXISTS (SELECT ... FROM orders WHERE ...)`.
-- But anon deliberately has no SELECT policy on orders (granting one would
-- let any anonymous visitor read every guest order's name/email/phone/
-- address), so that EXISTS subquery always evaluates false for anon - it
-- can't see the very row it's checking against, regardless of whether the
-- row actually matches. Route the check through a SECURITY DEFINER
-- function instead, matching the existing has_role()/is_vendor_member()
-- pattern in this schema: it bypasses RLS internally to answer one narrow
-- question (is this a guest order?) without exposing general read access.

CREATE OR REPLACE FUNCTION public.is_guest_order(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders WHERE id = _order_id AND user_id IS NULL
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_guest_order(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Guests can create order items" ON public.order_items;
CREATE POLICY "Guests can create order items"
  ON public.order_items FOR INSERT
  TO anon
  WITH CHECK (public.is_guest_order(order_id));

DROP POLICY IF EXISTS "Guests can create their payment record" ON public.payments;
CREATE POLICY "Guests can create their payment record"
  ON public.payments FOR INSERT
  TO anon
  WITH CHECK (public.is_guest_order(order_id));
