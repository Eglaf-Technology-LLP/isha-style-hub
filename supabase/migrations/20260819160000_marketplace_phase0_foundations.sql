-- Phase 0: fix the two silent disconnects found before onboarding real vendors.

-- 1. Enforce trusted/not-trusted product approval in the database, not just
-- in one client-side dialog. Any insert path (the existing vendor dialog,
-- a future bulk import, an admin acting on a vendor's behalf) now gets
-- correct behavior automatically, matching has_role()/is_vendor_member()'s
-- existing SECURITY DEFINER pattern in this schema.
CREATE OR REPLACE FUNCTION public.set_product_approval_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trusted boolean;
BEGIN
  IF NEW.vendor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_trusted INTO v_trusted FROM public.vendors WHERE id = NEW.vendor_id;

  NEW.approval_status := CASE WHEN COALESCE(v_trusted, false) THEN 'approved' ELSE 'pending_review' END;
  NEW.rejection_reason := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_set_approval_status ON public.products;
CREATE TRIGGER products_set_approval_status
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_product_approval_status();

-- 2. vendor_orders has the same "authenticated only, guest checkout falls
-- through" gap as orders/order_items/payments did. Same fix, same
-- SECURITY DEFINER pattern (anon can't SELECT into orders directly, so a
-- raw EXISTS subquery would silently fail for it).
DROP POLICY IF EXISTS "Guests create vendor orders at checkout" ON public.vendor_orders;
CREATE POLICY "Guests create vendor orders at checkout"
  ON public.vendor_orders FOR INSERT
  TO anon
  WITH CHECK (public.is_guest_order(order_id));
