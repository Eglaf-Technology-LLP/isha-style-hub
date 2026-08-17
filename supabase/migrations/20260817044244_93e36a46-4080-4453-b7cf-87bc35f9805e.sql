-- ============================================================
-- Multi-Vendor Marketplace — Step 1: roles, tables, RLS, backfill
-- ============================================================

-- 1. Extend the app_role enum with vendor roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor_staff';

-- 2. Create vendors table
CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  banner_url text,
  description text,
  contact_email text,
  contact_phone text,
  gst_number text,
  pan_number text,
  address jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended','rejected')),
  is_trusted boolean NOT NULL DEFAULT false,
  commission_rate numeric NOT NULL DEFAULT 10 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  shipping_flat_rate numeric NOT NULL DEFAULT 0,
  free_shipping_threshold numeric,
  return_window_days integer NOT NULL DEFAULT 7,
  return_policy text,
  payout_account_status text NOT NULL DEFAULT 'not_setup' CHECK (payout_account_status IN ('not_setup','pending','active','disabled')),
  rating numeric DEFAULT 0,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vendors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- 3. Create vendor_members table
CREATE TABLE IF NOT EXISTS public.vendor_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, vendor_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_members TO authenticated;
GRANT ALL ON public.vendor_members TO service_role;
ALTER TABLE public.vendor_members ENABLE ROW LEVEL SECURITY;

-- 4. Create vendor_orders table
CREATE TABLE IF NOT EXISTS public.vendor_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  subtotal numeric NOT NULL DEFAULT 0,
  shipping_cost numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  net_payable numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled','returned')),
  tracking_number text,
  carrier text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, vendor_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_orders TO authenticated;
GRANT ALL ON public.vendor_orders TO service_role;
ALTER TABLE public.vendor_orders ENABLE ROW LEVEL SECURITY;

-- 5. Create vendor_payouts table
CREATE TABLE IF NOT EXISTS public.vendor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_sales numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  net_payable numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, period_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_payouts TO authenticated;
GRANT ALL ON public.vendor_payouts TO service_role;
ALTER TABLE public.vendor_payouts ENABLE ROW LEVEL SECURITY;

-- 6. Extend existing tables
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending_review' CHECK (approval_status IN ('draft','pending_review','approved','rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_order_id uuid REFERENCES public.vendor_orders(id) ON DELETE SET NULL;

ALTER TABLE public.discounts
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE;

ALTER TABLE public.flash_sales
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE;

-- 7. Secure helper functions
CREATE OR REPLACE FUNCTION public.is_vendor_member(_user_id uuid, _vendor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendor_members
    WHERE user_id = _user_id
      AND vendor_id = _vendor_id
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_vendor_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vendor_id
  FROM public.vendor_members
  WHERE user_id = _user_id
  ORDER BY created_at ASC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.is_vendor_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_vendor_id(uuid) TO authenticated, anon;

-- 8. RLS policies — vendors
CREATE POLICY "Public can view approved vendors"
  ON public.vendors FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

CREATE POLICY "Vendor members can view their vendor"
  ON public.vendors FOR SELECT
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), id));

CREATE POLICY "Admins manage all vendors"
  ON public.vendors FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can apply to become a vendor"
  ON public.vendors FOR INSERT
  TO authenticated
  WITH CHECK (status = 'pending' OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vendor members can update their vendor"
  ON public.vendors FOR UPDATE
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_vendor_member(auth.uid(), id) OR public.has_role(auth.uid(), 'admin'));

-- 9. RLS policies — vendor_members
CREATE POLICY "Users can view their own memberships"
  ON public.vendor_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()
     OR public.has_role(auth.uid(), 'admin')
     OR public.is_vendor_member(auth.uid(), vendor_id));

CREATE POLICY "Users can create their own membership"
  ON public.vendor_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_vendor_member(auth.uid(), vendor_id));

CREATE POLICY "Admins and owners manage memberships"
  ON public.vendor_members FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
      OR public.is_vendor_member(auth.uid(), vendor_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin')
          OR public.is_vendor_member(auth.uid(), vendor_id));

CREATE POLICY "Admins and owners delete memberships"
  ON public.vendor_members FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
      OR public.is_vendor_member(auth.uid(), vendor_id));

-- 10. RLS policies — vendor_orders
CREATE POLICY "Vendor members and admins view vendor orders"
  ON public.vendor_orders FOR SELECT
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id)
      OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers view their own vendor orders"
  ON public.vendor_orders FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = vendor_orders.order_id AND o.user_id = auth.uid()
  ));

CREATE POLICY "Customers create vendor orders at checkout"
  ON public.vendor_orders FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = vendor_orders.order_id AND (o.user_id = auth.uid() OR o.user_id IS NULL)
  ));

CREATE POLICY "Vendor members and admins update vendor orders"
  ON public.vendor_orders FOR UPDATE
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id)
      OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_vendor_member(auth.uid(), vendor_id)
          OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete vendor orders"
  ON public.vendor_orders FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 11. RLS policies — vendor_payouts
CREATE POLICY "Vendor members and admins view payouts"
  ON public.vendor_payouts FOR SELECT
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id)
      OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage payouts"
  ON public.vendor_payouts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 12. RLS policies — products (vendor scoped)
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;

CREATE POLICY "Anyone can view approved products from approved vendors"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (is_active = true
     AND approval_status = 'approved'
     AND EXISTS (
       SELECT 1 FROM public.vendors v
       WHERE v.id = products.vendor_id AND v.status = 'approved'
     ));

CREATE POLICY "Vendor members can view their products"
  ON public.products FOR SELECT
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id));

CREATE POLICY "Vendor members can manage their products"
  ON public.products FOR ALL
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id))
  WITH CHECK (public.is_vendor_member(auth.uid(), vendor_id));

-- 13. RLS policies — order_items (vendor read access)
CREATE POLICY "Vendor members can view their order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id));

-- 14. Updated-at triggers for new tables
CREATE TRIGGER update_vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendor_orders_updated_at
  BEFORE UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendor_payouts_updated_at
  BEFORE UPDATE ON public.vendor_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- BACKFILL: seed vendor + assign existing data
-- ============================================================

-- Seed vendor for the existing "Isha Fashion Hub" store (fixed id for referencing)
INSERT INTO public.vendors (id, owner_user_id, name, slug, description, status, is_trusted,
    commission_rate, shipping_flat_rate, free_shipping_threshold, return_window_days,
    return_policy, payout_account_status, approved_by, approved_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '5a787e11-8444-429d-9940-6571fe4cc9ec',
  'Isha Fashion Hub',
  'isha-fashion-hub',
  'The flagship store of Isha Fashion Hub.',
  'approved',
  true,
  10,
  0,
  999,
  7,
  'Easy 7-day returns. Items must be unused with tags intact.',
  'active',
  '5a787e11-8444-429d-9940-6571fe4cc9ec',
  now()
)
ON CONFLICT (slug) DO UPDATE SET
  owner_user_id = EXCLUDED.owner_user_id,
  status = EXCLUDED.status,
  is_trusted = EXCLUDED.is_trusted,
  payout_account_status = EXCLUDED.payout_account_status;

-- Super admin is the owner of the seed vendor
INSERT INTO public.vendor_members (user_id, vendor_id, role)
VALUES ('5a787e11-8444-429d-9940-6571fe4cc9ec', '11111111-1111-1111-1111-111111111111', 'owner')
ON CONFLICT (user_id, vendor_id) DO NOTHING;

-- Assign all existing products to the seed vendor and mark them approved
UPDATE public.products
SET vendor_id = '11111111-1111-1111-1111-111111111111',
    approval_status = 'approved'
WHERE vendor_id IS NULL;

-- Tag existing order items with the vendor of their product
UPDATE public.order_items oi
SET vendor_id = p.vendor_id
FROM public.products p
WHERE oi.product_id = p.id::text
  AND oi.vendor_id IS NULL;

-- Create one vendor_order per (order, vendor) for existing orders
INSERT INTO public.vendor_orders (order_id, vendor_id, subtotal, shipping_cost,
    commission_rate, commission_amount, net_payable, status)
SELECT o.id,
       oi.vendor_id,
       COALESCE(SUM(oi.price * oi.quantity), 0),
       0,
       10,
       COALESCE(SUM(oi.price * oi.quantity), 0) * 0.10,
       COALESCE(SUM(oi.price * oi.quantity), 0) * 0.90,
       o.order_status
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
WHERE oi.vendor_id IS NOT NULL
GROUP BY o.id, oi.vendor_id
ON CONFLICT (order_id, vendor_id) DO NOTHING;

-- Link order items to their vendor order
UPDATE public.order_items oi
SET vendor_order_id = vo.id
FROM public.vendor_orders vo
WHERE oi.order_id = vo.order_id
  AND oi.vendor_id = vo.vendor_id
  AND oi.vendor_order_id IS NULL;
