-- The previous migration's orders policy references vendor_orders, and
-- vendor_orders already had "Customers view their own vendor orders",
-- which references orders. Together that's a genuine RLS cycle:
-- querying vendor_orders evaluates its own policies -> one queries orders
-- -> orders' new policy queries vendor_orders again -> infinite recursion
-- (Postgres correctly detects and rejects this rather than looping
-- forever - error 42P17).
--
-- Same fix as everywhere else this session a cross-table RLS check has
-- shown up: route it through a SECURITY DEFINER function. Its internal
-- query runs as the function's definer, not the calling role, so it
-- never re-enters vendor_orders' own RLS and the cycle is broken.
CREATE OR REPLACE FUNCTION public.order_contains_vendor_sale(_order_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendor_orders vo
    WHERE vo.order_id = _order_id
      AND public.is_vendor_member(_user_id, vo.vendor_id)
  )
$$;

GRANT EXECUTE ON FUNCTION public.order_contains_vendor_sale(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Vendor members can view orders containing their sales" ON public.orders;
CREATE POLICY "Vendor members can view orders containing their sales"
  ON public.orders FOR SELECT
  TO authenticated
  USING (public.order_contains_vendor_sale(id, auth.uid()));
