-- =====================================================================
-- AllBoutiqs LIVE database - STEP 1 of 5: the full database structure
-- Project: allboutiqs-marketplace-live (whycxtnjhdbewgyugfax)
--
-- What it is: all 100 files from supabase/migrations (20260109180822 ... 20261025190000)
-- joined in order - every table, rule (RLS), function, trigger, storage
-- bucket and scheduled job the app needs, plus the built-in basic settings
-- (warehouse, HSN codes, Indian states, platform settings and rates).
-- No customers, orders or boutiques.
--
-- How to run: Supabase dashboard -> SQL Editor -> New query -> paste this
-- whole file -> Run. Run it ONCE, on the new empty database only.
--
-- Safe if it fails: it is one transaction, so on any error nothing is kept
-- and the database stays empty - fix the problem and run it again.
--
-- It also records the 100 migrations as already applied, so from now
-- on `npx supabase db push` only sends migrations added after 20261025190000.
-- =====================================================================

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    RAISE EXCEPTION 'Stopped: this database already has the AllBoutiqs tables (public.products exists). This script is only for a new, empty database.';
  END IF;
END
$guard$;

-- ===== [001/100] 20260109180822_f2fa9873-cbb1-4cb9-ace9-9cdc8deb9e4f.sql =====
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  shipping_address JSONB NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod', 'stripe', 'razorpay')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  subtotal DECIMAL(10, 2) NOT NULL,
  shipping_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order_items table
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  variant_title TEXT,
  size TEXT,
  color TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User roles policies (admin only)
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Categories policies (public read, admin write)
CREATE POLICY "Anyone can view categories"
  ON public.categories FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can manage categories"
  ON public.categories FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Orders policies
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Admins can manage all orders"
  ON public.orders FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Order items policies
CREATE POLICY "Users can view their order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
      AND (orders.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Users can create order items"
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
      AND (orders.user_id = auth.uid() OR orders.user_id IS NULL)
    )
  );

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create profile on signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for category images
INSERT INTO storage.buckets (id, name, public) VALUES ('category-images', 'category-images', true);

-- Storage policies for category images
CREATE POLICY "Anyone can view category images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'category-images');

CREATE POLICY "Admins can upload category images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'category-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update category images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'category-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete category images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'category-images' AND public.has_role(auth.uid(), 'admin'));

-- ===== [002/100] 20260112192522_98ed0aa5-94ad-4010-9aee-51c725ccb922.sql =====
-- Create products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  compare_at_price NUMERIC,
  sku TEXT,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  images TEXT[] DEFAULT '{}',
  variants JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create discounts/coupons table
CREATE TABLE public.discounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage', 'fixed_amount'
  discount_value NUMERIC NOT NULL DEFAULT 0,
  min_order_amount NUMERIC DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  product_ids UUID[] DEFAULT NULL, -- NULL means applies to all products
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payments table for tracking payments and refunds
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded', 'partially_refunded'
  transaction_id TEXT,
  refund_amount NUMERIC DEFAULT 0,
  refund_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Products policies
CREATE POLICY "Anyone can view active products" ON public.products
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage products" ON public.products
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Discounts policies
CREATE POLICY "Anyone can view active discounts" ON public.discounts
  FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "Admins can manage discounts" ON public.discounts
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Payments policies
CREATE POLICY "Users can view their payments" ON public.payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = payments.order_id 
      AND (orders.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Admins can manage payments" ON public.payments
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_discounts_updated_at
  BEFORE UPDATE ON public.discounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===== [003/100] 20260118212849_ae5f64b8-7557-4c0b-b61e-7776005a36fd.sql =====
-- Create wishlists table
CREATE TABLE public.wishlists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own wishlist"
ON public.wishlists
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create product reviews table
CREATE TABLE public.product_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  review_text TEXT,
  is_verified_purchase BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, user_id)
);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view approved reviews"
ON public.product_reviews
FOR SELECT
USING (is_approved = true);

CREATE POLICY "Users can create reviews"
ON public.product_reviews
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews"
ON public.product_reviews
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews"
ON public.product_reviews
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all reviews"
ON public.product_reviews
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_product_reviews_updated_at
BEFORE UPDATE ON public.product_reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create size guides table
CREATE TABLE public.size_guides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sizes JSONB NOT NULL DEFAULT '[]'::jsonb,
  measurements JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.size_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view size guides"
ON public.size_guides
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage size guides"
ON public.size_guides
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_size_guides_updated_at
BEFORE UPDATE ON public.size_guides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create recently viewed table
CREATE TABLE public.recently_viewed (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their recently viewed"
ON public.recently_viewed
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create product comparisons table
CREATE TABLE public.product_comparisons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  session_id TEXT,
  product_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their comparisons"
ON public.product_comparisons
FOR ALL
USING (user_id = auth.uid() OR user_id IS NULL)
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE TRIGGER update_product_comparisons_updated_at
BEFORE UPDATE ON public.product_comparisons
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create flash sales table
CREATE TABLE public.flash_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  discount_percentage NUMERIC NOT NULL DEFAULT 0,
  product_ids UUID[] NOT NULL DEFAULT '{}',
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.flash_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active flash sales"
ON public.flash_sales
FOR SELECT
USING (is_active = true AND starts_at <= now() AND ends_at > now());

CREATE POLICY "Admins can manage flash sales"
ON public.flash_sales
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_flash_sales_updated_at
BEFORE UPDATE ON public.flash_sales
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create newsletter subscribers table
CREATE TABLE public.newsletter_subscribers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  is_subscribed BOOLEAN NOT NULL DEFAULT true,
  subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe to newsletter"
ON public.newsletter_subscribers
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can manage subscribers"
ON public.newsletter_subscribers
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create loyalty points table
CREATE TABLE public.loyalty_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  total_points INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own loyalty points"
ON public.loyalty_points
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage loyalty points"
ON public.loyalty_points
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_loyalty_points_updated_at
BEFORE UPDATE ON public.loyalty_points
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create loyalty transactions table
CREATE TABLE public.loyalty_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  points INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earn', 'redeem', 'expire', 'bonus', 'referral')),
  description TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions"
ON public.loyalty_transactions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage loyalty transactions"
ON public.loyalty_transactions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create gift cards table
CREATE TABLE public.gift_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  initial_balance NUMERIC NOT NULL,
  current_balance NUMERIC NOT NULL,
  purchaser_user_id UUID,
  recipient_email TEXT,
  recipient_name TEXT,
  message TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their purchased gift cards"
ON public.gift_cards
FOR SELECT
USING (auth.uid() = purchaser_user_id);

CREATE POLICY "Admins can manage gift cards"
ON public.gift_cards
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_gift_cards_updated_at
BEFORE UPDATE ON public.gift_cards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create referrals table
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_user_id UUID NOT NULL,
  referral_code TEXT NOT NULL UNIQUE,
  referred_user_id UUID,
  referred_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'completed', 'rewarded')),
  referrer_reward_points INTEGER NOT NULL DEFAULT 500,
  referred_reward_points INTEGER NOT NULL DEFAULT 200,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own referrals"
ON public.referrals
FOR SELECT
USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

CREATE POLICY "Users can create referrals"
ON public.referrals
FOR INSERT
WITH CHECK (auth.uid() = referrer_user_id);

CREATE POLICY "Admins can manage referrals"
ON public.referrals
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add related_product_ids and tags to products for related products feature
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS related_product_ids UUID[] DEFAULT '{}';

-- ===== [004/100] 20260207193644_c470cc76-cfd4-4570-91e6-0d363832d8c3.sql =====

-- Create return request types
CREATE TABLE public.return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  user_id uuid NOT NULL,
  request_type text NOT NULL DEFAULT 'return', -- 'return' or 'exchange'
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected, picked_up, completed, cancelled
  reason text NOT NULL,
  additional_notes text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb, -- array of {order_item_id, product_title, quantity, size, color}
  exchange_details jsonb, -- for exchange: {new_size, new_color, new_variant_id}
  admin_notes text,
  refund_amount numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can create return requests"
ON public.return_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own return requests"
ON public.return_requests
FOR SELECT
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage return requests"
ON public.return_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_return_requests_updated_at
BEFORE UPDATE ON public.return_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ===== [005/100] 20260331234341_e5470a7f-0e2d-44a6-9c00-58ec4afd6b40.sql =====
CREATE POLICY "Users can cancel their own pending return requests"
ON public.return_requests
FOR UPDATE
TO public
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

-- ===== [006/100] 20260616053410_e3760b59-12f6-4f90-9725-2808317b21a5.sql =====

CREATE TYPE public.membership_plan AS ENUM ('monthly', 'annual');
CREATE TYPE public.membership_status AS ENUM ('active', 'cancelled', 'expired');

CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan public.membership_plan NOT NULL,
  status public.membership_status NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  auto_renew boolean NOT NULL DEFAULT true,
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_memberships_user_active ON public.memberships(user_id, status, expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own memberships" ON public.memberships
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own memberships" ON public.memberships
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own memberships" ON public.memberships
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins manage memberships" ON public.memberships
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_memberships_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== [007/100] 20260817044244_93e36a46-4080-4453-b7cf-87bc35f9805e.sql =====
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

-- Seed vendor for the existing "Isha Fashion Hub" store (fixed id for referencing).
-- Guarded on the seed owner existing: this ID is a specific admin account from the
-- original project and won't be present on a freshly provisioned database.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = '5a787e11-8444-429d-9940-6571fe4cc9ec') THEN
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
  END IF;
END $$;

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

-- ===== [008/100] 20260817044300_f1d7ebbb-0e3c-4bb4-b9ed-df3fe73143ee.sql =====
REVOKE EXECUTE ON FUNCTION public.is_vendor_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_vendor_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_vendor_member(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_vendor_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_vendor_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_vendor_id(uuid) FROM authenticated;

-- ===== [009/100] 20260819150000_fix_checkout_rls_gaps.sql =====
-- Fix checkout RLS gaps.
--
-- "Users can create orders" / "Users can create order items" were scoped
-- TO authenticated only, so guest checkout (user_id IS NULL, which the app
-- explicitly supports) was rejected outright for anonymous customers.
-- `payments` had no customer-facing INSERT policy at all - admins only -
-- so even a logged-in customer's own checkout failed at the payment step.

CREATE POLICY "Guests can create orders"
  ON public.orders FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Guests can create order items"
  ON public.order_items FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.user_id IS NULL
    )
  );

CREATE POLICY "Guests can create their payment record"
  ON public.payments FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = payments.order_id
        AND orders.user_id IS NULL
    )
  );

CREATE POLICY "Users can create their payment record"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = payments.order_id
        AND (orders.user_id = auth.uid() OR orders.user_id IS NULL)
    )
  );

-- Checkout applies a discount code by incrementing used_count directly,
-- which no RLS policy permitted for customers (it failed silently since
-- the app doesn't check the error on that call). Route it through a
-- SECURITY DEFINER function instead of a broad UPDATE policy, so a
-- customer can only bump the counter, not rewrite the discount's value,
-- expiry, or active flag.
CREATE OR REPLACE FUNCTION public.increment_discount_usage(_discount_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.discounts
  SET used_count = used_count + 1
  WHERE id = _discount_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_discount_usage(uuid) TO anon, authenticated;

-- ===== [010/100] 20260819151500_fix_guest_order_items_payments_rls.sql =====
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

-- ===== [011/100] 20260819160000_marketplace_phase0_foundations.sql =====
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

-- ===== [012/100] 20260819161500_fix_vendor_registration_rls.sql =====
-- useVendor.ts's registerVendor() does insert(...).select().single() on
-- vendors. A freshly self-registering owner has status='pending' (not
-- covered by "Public can view approved vendors") and no vendor_members row
-- yet - that insert happens in a second step, right after this one - so
-- "Vendor members can view their vendor" doesn't cover it either. No
-- existing SELECT policy lets them read back the row they just created,
-- so every vendor registration fails with an RLS error before it even
-- reaches the vendor_members insert.
--
-- Unlike the guest-checkout case, this is a real authenticated session, so
-- the fix isn't "skip the reselect" - it's a straightforward, safe policy
-- that was simply missing: an owner can always see their own vendor row.
CREATE POLICY "Owners can view their own vendor application"
  ON public.vendors FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

-- ===== [013/100] 20260820090000_vendor_order_fulfillment_visibility.sql =====
-- VendorDashboard.tsx fetches orders.customer_name for its own vendor_orders,
-- but no SELECT policy on `orders` covers a vendor who isn't the order's
-- own user_id and isn't admin - "Users can view their own orders" only
-- covers the customer themselves. Every vendor order silently showed the
-- "Customer" placeholder instead of a real name, and nothing exposed the
-- shipping address or phone a vendor actually needs to fulfil the order.
--
-- Scoped narrowly via vendor_orders, so a vendor only ever sees orders
-- that genuinely contain one of their own vendor_orders - never another
-- vendor's customers.
CREATE POLICY "Vendor members can view orders containing their sales"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendor_orders vo
      WHERE vo.order_id = orders.id
        AND public.is_vendor_member(auth.uid(), vo.vendor_id)
    )
  );

-- ===== [014/100] 20260820091500_fix_vendor_orders_rls_recursion.sql =====
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

-- ===== [015/100] 20260820100000_vendor_payout_accounts.sql =====
-- Bank/payout details for split payments (Phase 4). Kept in a separate
-- table rather than columns on `vendors`, because `vendors` has a broad
-- "Public can view approved vendors" SELECT policy for the storefront -
-- bank account numbers have no business being reachable through that.
-- Only the vendor's own members and admins can ever read this table.
CREATE TABLE public.vendor_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL UNIQUE REFERENCES public.vendors(id) ON DELETE CASCADE,
  account_holder_name text NOT NULL,
  bank_account_number text NOT NULL,
  bank_ifsc text NOT NULL,
  business_type text NOT NULL DEFAULT 'individual'
    CHECK (business_type IN ('individual', 'proprietorship', 'partnership', 'private_limited', 'llp')),
  razorpay_account_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_payout_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor members can view their own payout account"
  ON public.vendor_payout_accounts FOR SELECT
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vendor members can create their own payout account"
  ON public.vendor_payout_accounts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vendor_member(auth.uid(), vendor_id));

CREATE POLICY "Vendor members can update their own payout account"
  ON public.vendor_payout_accounts FOR UPDATE
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_vendor_payout_accounts_updated_at
  BEFORE UPDATE ON public.vendor_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== [016/100] 20260820103000_protect_vendor_admin_only_fields.sql =====
-- "Vendor members can update their vendor" is row-scoped (is_vendor_member),
-- which is correct for letting a vendor edit their own shipping/returns/
-- description - but RLS has no column granularity, so as written it also
-- let any vendor UPDATE is_trusted, status, commission_rate, approved_by/
-- approved_at or owner_user_id on themselves directly via the API,
-- completely bypassing the trusted-partner/approval model this whole
-- marketplace is built around. Not theoretical - a plain
-- supabase.from('vendors').update({ is_trusted: true }) from any vendor's
-- own session would have worked.
--
-- RLS can't express "this row, but only these columns" on its own, so
-- enforce it with a trigger instead: non-admin writes to these columns
-- are silently reverted to their prior value rather than erroring, since
-- a vendor's own update calls legitimately resubmit the whole row and
-- should just leave admin-owned fields untouched.
CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  NEW.is_trusted := OLD.is_trusted;
  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.owner_user_id := OLD.owner_user_id;

  -- Exception: a vendor may kick off payout verification (-> 'pending')
  -- themselves, but can't mark their own account active/disabled - that
  -- only happens once the payment gateway (or an admin) verifies it.
  IF NEW.payout_account_status <> 'pending' THEN
    NEW.payout_account_status := OLD.payout_account_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_vendor_admin_fields_trigger ON public.vendors;
CREATE TRIGGER protect_vendor_admin_fields_trigger
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.protect_vendor_admin_fields();

-- ===== [017/100] 20260820110000_razorpay_payment_fields.sql =====
-- Real payment collection via Razorpay. Route (marketplace split-at-
-- checkout) isn't enabled on this Razorpay account yet, so this is a
-- single payment to the platform per order; vendor_orders already tracks
-- what each vendor is owed (subtotal + shipping - commission) and that
-- stays exactly as-is as the payout ledger. Actual vendor settlement is a
-- separate later step once Route (or manual transfer) is available.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text;

-- ===== [018/100] 20260821090000_fix_payment_status_and_gateway_fees.sql =====
-- usePayments.ts wrote payment_status values ("completed", "partially_refunded")
-- that were never in this constraint at all - markPaymentComplete() and a
-- partial refund would both throw a DB error today. The admin's own revenue
-- stats separately checked for "completed" too, so they silently never
-- matched real data (which is always "paid"), making "Total Received"/
-- "Net Revenue" effectively broken - not just imprecise.
--
-- Standardizing on "paid" (already used everywhere else: orders.payment_status,
-- the Razorpay integration) instead of adding "completed" as a redundant
-- synonym, and adding "partially_refunded" for real since partial refunds
-- are genuine, already-attempted functionality.
-- Live proof of the bug this migration fixes: two real payments already
-- have payment_status = 'completed', written by markPaymentComplete()
-- via the admin's "Mark as Completed" button, sitting inconsistently
-- alongside their orders (which correctly show 'paid', since orders'
-- own constraint never allowed 'completed' in the first place).
UPDATE public.payments SET payment_status = 'paid' WHERE payment_status = 'completed';

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded'));

-- Razorpay's fee (inclusive of GST) charged per transaction - never captured
-- anywhere before, so there was no way to see the platform's true net take
-- after the payment gateway's own cut, only gross amounts.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gateway_fee numeric,
  ADD COLUMN IF NOT EXISTS gateway_tax numeric;

-- ===== [019/100] 20260821100000_inventory_system_foundation.sql =====
-- Real inventory system: normalized variants (replacing the products.variants
-- jsonb blob, which two of the three product-edit surfaces never kept in sync
-- with stock_quantity), a real low_stock_threshold column (the old one never
-- existed - useLowStockAlerts.ts was reading/writing a column that isn't in
-- any migration, which is why every product silently defaulted to threshold
-- 10 and "Update Threshold" threw a DB error whenever clicked), and an
-- append-only stock_movements audit ledger.

CREATE TABLE public.product_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  options JSONB NOT NULL DEFAULT '{}',
  price NUMERIC,
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_variants_product_id ON public.product_variants(product_id);

CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill from the existing jsonb column before dropping it.
INSERT INTO public.product_variants (product_id, name, sku, options, price, stock)
SELECT
  p.id,
  COALESCE(elem->>'name', 'Default'),
  elem->>'sku',
  COALESCE(elem->'options', '{}'::jsonb),
  NULLIF(elem->>'price', '')::numeric,
  COALESCE((elem->>'stock')::integer, 0)
FROM public.products p, jsonb_array_elements(p.variants) elem
WHERE p.variants IS NOT NULL AND jsonb_array_length(p.variants) > 0;

ALTER TABLE public.products DROP COLUMN variants;
ALTER TABLE public.products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 10;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Mirrors the existing "Anyone can view approved products from approved
-- vendors" policy on products itself, just re-scoped through product_id.
CREATE POLICY "Anyone can view variants of approved products"
  ON public.product_variants FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND p.is_active = true
        AND p.approval_status = 'approved'
        AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = p.vendor_id AND v.status = 'approved')
    )
  );

CREATE POLICY "Vendor members and admins view all their variants"
  ON public.product_variants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND (public.is_vendor_member(auth.uid(), p.vendor_id) OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Vendor members and admins manage variants"
  ON public.product_variants FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND (public.is_vendor_member(auth.uid(), p.vendor_id) OR public.has_role(auth.uid(), 'admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND (public.is_vendor_member(auth.uid(), p.vendor_id) OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- Append-only stock audit ledger, shaped like the existing loyalty_transactions
-- table (signed amount + type CHECK-enum + optional order_id FK + created_at
-- only, no updated_at - rows are immutable by convention).
CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  change_quantity INTEGER NOT NULL,
  resulting_quantity INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('sale', 'restock', 'manual_adjustment', 'return', 'correction')),
  reason TEXT,
  reference_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX idx_stock_movements_variant_id ON public.stock_movements(variant_id);
CREATE INDEX idx_stock_movements_vendor_id ON public.stock_movements(vendor_id);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- No INSERT/UPDATE/DELETE policy for any client role, on purpose - the only
-- way a row is ever written is through adjust_stock() below (SECURITY DEFINER,
-- runs as the table owner and so isn't subject to this restriction), the same
-- "only this code path can write it" principle already used for
-- payments.payment_status in verify-razorpay-payment.
CREATE POLICY "Vendor members and admins view stock movements"
  ON public.stock_movements FOR SELECT
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

-- Guards products.stock_quantity and product_variants.stock against direct
-- client writes, so VendorProductDialog (which today writes stock_quantity
-- directly and would otherwise silently desync it from variants, or bypass
-- the audit log entirely) can no longer change either column except through
-- adjust_stock(). Same "revert the protected field" shape as
-- protect_vendor_admin_fields, just gated on a transaction-local flag instead
-- of a role check.
CREATE OR REPLACE FUNCTION public.protect_stock_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_stock_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'products' THEN
    NEW.stock_quantity := OLD.stock_quantity;
  ELSIF TG_TABLE_NAME = 'product_variants' THEN
    NEW.stock := OLD.stock;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_products_stock_quantity
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.protect_stock_columns();

CREATE TRIGGER protect_product_variants_stock
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.protect_stock_columns();

-- The one legitimate way to change stock anywhere in the system: checkout
-- decrements, manual adjustments, and bulk updates all route through this.
-- Guarded UPDATE (stock + delta >= 0) both prevents overselling and gets
-- Postgres's row lock to make concurrent decrements race-safe for free - no
-- explicit SELECT ... FOR UPDATE needed. auth.uid() is read here rather than
-- accepted as a parameter so a caller can't lie about who made the change.
CREATE OR REPLACE FUNCTION public.adjust_stock(
  _product_id UUID,
  _variant_id UUID,
  _delta INTEGER,
  _movement_type TEXT,
  _reason TEXT,
  _reference_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resulting INTEGER;
  v_vendor_id UUID;
  v_variant_sum INTEGER;
  v_product_name TEXT;
BEGIN
  PERFORM set_config('app.bypass_stock_protection', 'true', true);

  SELECT vendor_id, name INTO v_vendor_id, v_product_name
  FROM public.products WHERE id = _product_id;

  IF _variant_id IS NOT NULL THEN
    UPDATE public.product_variants
    SET stock = stock + _delta
    WHERE id = _variant_id AND product_id = _product_id AND stock + _delta >= 0
    RETURNING stock INTO v_resulting;

    IF v_resulting IS NULL THEN
      RAISE EXCEPTION 'Insufficient stock for %', COALESCE(v_product_name, 'this item');
    END IF;

    SELECT COALESCE(SUM(stock), 0) INTO v_variant_sum
    FROM public.product_variants WHERE product_id = _product_id;

    UPDATE public.products SET stock_quantity = v_variant_sum WHERE id = _product_id;
  ELSE
    UPDATE public.products
    SET stock_quantity = stock_quantity + _delta
    WHERE id = _product_id AND stock_quantity + _delta >= 0
    RETURNING stock_quantity INTO v_resulting;

    IF v_resulting IS NULL THEN
      RAISE EXCEPTION 'Insufficient stock for %', COALESCE(v_product_name, 'this item');
    END IF;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, variant_id, vendor_id, change_quantity, resulting_quantity,
    movement_type, reason, reference_order_id, changed_by
  ) VALUES (
    _product_id, _variant_id, v_vendor_id, _delta, v_resulting,
    _movement_type, _reason, _reference_order_id, auth.uid()
  );

  RETURN jsonb_build_object('resulting_quantity', v_resulting, 'product_name', v_product_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, integer, text, text, uuid) TO anon, authenticated;

-- ===== [020/100] 20260821110000_adjust_stock_variant_fallback.sql =====
-- Checkout will call adjust_stock with whatever variant id a cart line item
-- carries. Until ProductCard's quick-add is fixed to stop faking one for
-- variant-having products, some of those ids won't correspond to any real
-- product_variants row. Rather than making checkout depend on that fix
-- landing first, adjust_stock now falls back to the product's own aggregate
-- stock_quantity whenever the given variant id doesn't exist - so it does the
-- right thing regardless of which cart entry point produced the line item.
CREATE OR REPLACE FUNCTION public.adjust_stock(
  _product_id UUID,
  _variant_id UUID,
  _delta INTEGER,
  _movement_type TEXT,
  _reason TEXT,
  _reference_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resulting INTEGER;
  v_vendor_id UUID;
  v_variant_sum INTEGER;
  v_product_name TEXT;
  v_variant_id UUID;
BEGIN
  PERFORM set_config('app.bypass_stock_protection', 'true', true);

  SELECT vendor_id, name INTO v_vendor_id, v_product_name
  FROM public.products WHERE id = _product_id;

  SELECT id INTO v_variant_id
  FROM public.product_variants
  WHERE id = _variant_id AND product_id = _product_id;

  IF v_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
    SET stock = stock + _delta
    WHERE id = v_variant_id AND stock + _delta >= 0
    RETURNING stock INTO v_resulting;

    IF v_resulting IS NULL THEN
      RAISE EXCEPTION 'Insufficient stock for %', COALESCE(v_product_name, 'this item');
    END IF;

    SELECT COALESCE(SUM(stock), 0) INTO v_variant_sum
    FROM public.product_variants WHERE product_id = _product_id;

    UPDATE public.products SET stock_quantity = v_variant_sum WHERE id = _product_id;
  ELSE
    UPDATE public.products
    SET stock_quantity = stock_quantity + _delta
    WHERE id = _product_id AND stock_quantity + _delta >= 0
    RETURNING stock_quantity INTO v_resulting;

    IF v_resulting IS NULL THEN
      RAISE EXCEPTION 'Insufficient stock for %', COALESCE(v_product_name, 'this item');
    END IF;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, variant_id, vendor_id, change_quantity, resulting_quantity,
    movement_type, reason, reference_order_id, changed_by
  ) VALUES (
    _product_id, v_variant_id, v_vendor_id, _delta, v_resulting,
    _movement_type, _reason, _reference_order_id, auth.uid()
  );

  RETURN jsonb_build_object('resulting_quantity', v_resulting, 'product_name', v_product_name);
END;
$$;

-- ===== [021/100] 20260821120000_cancel_pending_order_function.sql =====
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

-- ===== [022/100] 20260822090000_require_signin_drop_guest_checkout.sql =====
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

-- ===== [023/100] 20260822090100_saved_addresses.sql =====
-- Finishes a feature that was already fully built in the frontend
-- (src/hooks/useSavedAddresses.ts, src/components/account/AddressSection.tsx,
-- wired into the Addresses tab on /account) but never migrated - every call
-- there is wrapped in `(supabase as any)` because this table didn't exist,
-- and it has been erroring at runtime. Column names/types match that
-- existing SavedAddress/AddressFormData contract exactly.
CREATE TABLE public.saved_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_line_1 TEXT NOT NULL,
  address_line_2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_addresses_user_id ON public.saved_addresses(user_id);

ALTER TABLE public.saved_addresses ENABLE ROW LEVEL SECURITY;

-- Simplest per-user pattern already used in this schema (matches wishlists).
CREATE POLICY "Users can manage their own saved addresses"
  ON public.saved_addresses
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ===== [024/100] 20260822100000_product_variant_images.sql =====
-- Optional per-variant image (e.g. a color's own photo) so the storefront
-- can show that specific variant's picture instead of the shared product
-- gallery when it's selected. Nullable - most variants won't set one and
-- fall back to the product's own images.
ALTER TABLE public.product_variants ADD COLUMN image_url TEXT;

-- ===== [025/100] 20260822110000_shiprocket_foundations.sql =====
-- Shiprocket courier integration: schema foundations.
-- Vendor pickup address/registration, shipments + audit trail, product
-- dimensions for parcel weight, order_items SKU snapshot, and a small
-- token cache for the Shiprocket auth API.

-- 1. Fix vendors.address shape to match orders.shipping_address exactly
-- ({line1,...} -> {address_line1, address_line2, city, state, pincode,
-- country}), and add pickup-registration tracking fields.
UPDATE public.vendors
SET address = jsonb_build_object(
  'address_line1', address->'line1',
  'address_line2', null,
  'city', address->'city',
  'state', address->'state',
  'pincode', address->'pincode',
  'country', 'India'
)
WHERE address IS NOT NULL AND address ? 'line1';

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_location text,
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_registered_at timestamptz;

-- 2. Extend vendor_orders.status with the two courier-driven states the
-- existing 7 values don't cover (RTO already maps to 'returned').
ALTER TABLE public.vendor_orders DROP CONSTRAINT IF EXISTS vendor_orders_status_check;
ALTER TABLE public.vendor_orders ADD CONSTRAINT vendor_orders_status_check
  CHECK (status IN ('pending','confirmed','processing','shipped','out_for_delivery',
                     'delivered','cancelled','returned','ndr'));

-- 3. Optional per-product physical dimensions for parcel weight/size at
-- shipment creation time. Nullable - "Ship Now" falls back to a platform
-- default (300g, 25x20x3cm) for any item missing these, never blocks on it.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight_grams integer,
  ADD COLUMN IF NOT EXISTS length_cm numeric,
  ADD COLUMN IF NOT EXISTS breadth_cm numeric,
  ADD COLUMN IF NOT EXISTS height_cm numeric;

-- 4. Snapshot SKU on order_items at checkout time, same rationale as the
-- already-snapshotted product_title/variant_title (product can change
-- or be deleted after the order is placed).
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS sku text;

-- 5. shipments: one row per courier booking (forward, return, or either
-- leg of an exchange).
CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_order_id uuid NOT NULL REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  shipment_type text NOT NULL DEFAULT 'forward'
    CHECK (shipment_type IN ('forward','return','exchange_forward','exchange_return')),
  shiprocket_order_id bigint,
  shiprocket_shipment_id bigint,
  awb_code text UNIQUE,
  courier_id integer,
  courier_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','awb_assigned','pickup_scheduled','picked_up',
                       'in_transit','out_for_delivery','delivered','ndr','rto',
                       'cancelled','lost')),
  status_raw text,
  label_url text,
  manifest_url text,
  invoice_url text,
  pickup_scheduled_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  rto_initiated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipments_vendor_order_id ON public.shipments(vendor_order_id);
CREATE INDEX idx_shipments_return_request_id ON public.shipments(return_request_id);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor members and admins view shipments"
  ON public.shipments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_orders vo
    WHERE vo.id = shipments.vendor_order_id
      AND (public.is_vendor_member(auth.uid(), vo.vendor_id) OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Customers view shipments on their own orders"
  ON public.shipments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_orders vo
    JOIN public.orders o ON o.id = vo.order_id
    WHERE vo.id = shipments.vendor_order_id AND o.user_id = auth.uid()
  ));

-- No client-writable policy at all, by design - only the service-role
-- key (used exclusively by the Shiprocket edge functions) can write here,
-- same lockdown pattern as payments.payment_status.

CREATE TRIGGER update_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. shipment_events: append-only audit trail of every webhook tracking
-- event received, so "is anything missing or wrong" can always be
-- answered from real data rather than trusting a status column alone.
CREATE TABLE public.shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES public.shipments(id) ON DELETE CASCADE,
  awb_code text NOT NULL,
  event_status text,
  event_status_id integer,
  activity text,
  location text,
  event_timestamp timestamptz,
  raw_payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_shipment_events_dedupe
  ON public.shipment_events(shipment_id, event_status_id, event_timestamp)
  WHERE shipment_id IS NOT NULL;

CREATE INDEX idx_shipment_events_awb_code ON public.shipment_events(awb_code);

ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor members and admins view shipment events"
  ON public.shipment_events FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shipments s
    JOIN public.vendor_orders vo ON vo.id = s.vendor_order_id
    WHERE s.id = shipment_events.shipment_id
      AND (public.is_vendor_member(auth.uid(), vo.vendor_id) OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Customers view shipment events on their own orders"
  ON public.shipment_events FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shipments s
    JOIN public.vendor_orders vo ON vo.id = s.vendor_order_id
    JOIN public.orders o ON o.id = vo.order_id
    WHERE s.id = shipment_events.shipment_id AND o.user_id = auth.uid()
  ));

-- 7. shiprocket_tokens: single-row cache for the auth bearer token
-- (valid ~10 days), service-role only - avoids re-authenticating on
-- every edge function invocation.
CREATE TABLE public.shiprocket_tokens (
  id integer PRIMARY KEY DEFAULT 1,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shiprocket_tokens_singleton CHECK (id = 1)
);

ALTER TABLE public.shiprocket_tokens ENABLE ROW LEVEL SECURITY;
-- No policies at all - service-role only, no client access whatsoever.

-- ===== [026/100] 20260822120000_shiprocket_pickup_id.sql =====
-- Exchange orders address the seller's pickup/shipping location by a
-- numeric id (seller_pickup_location_id/seller_shipping_location_id),
-- distinct from the pickup_location name string used by addpickup and
-- the Forward wrapper - capture both on the vendor row.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_id integer;

-- ===== [027/100] 20260823090000_vendor_image_upload_storage.sql =====
-- Vendors could never actually upload an image file - the category-images
-- bucket's write policies are all gated to admin only, which is why
-- VendorProductDialog/VariantManager's "image" fields were plain URL text
-- boxes instead of real uploads. Scoped to a vendor-uploads/ path prefix
-- so this doesn't touch admin's existing products/categories paths at all.
CREATE POLICY "Vendor members upload their own images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = 'vendor-uploads'
    AND EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Vendor members update their own images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = 'vendor-uploads'
    AND EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Vendor members delete their own images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = 'vendor-uploads'
    AND EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = auth.uid())
  );

-- ===== [028/100] 20260824090000_product_specifications.sql =====
-- Per-product free-form specifications (Wash Care, Fabric, Package
-- Contains, etc. - varies product to product, not just category to
-- category) plus two fields the legal-metrology-style compliance block
-- on the product page needs that nothing existing covers.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS specifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS country_of_origin text NOT NULL DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS net_quantity text NOT NULL DEFAULT '1 N';

-- ===== [029/100] 20260824100000_shipment_channel_order_id.sql =====
-- Shiprocket treats the order_id we send (their "channel_order_id") as an
-- idempotency key - sending the same value on a retry after a
-- cancellation returns/reuses the SAME stale order (still bound to
-- whatever pickup location it originally had) instead of creating a
-- genuinely fresh one. Confirmed live: a vendor's corrected pickup
-- address never actually took effect on a real retry because of this.
-- Storing the exact per-attempt id we sent lets the webhook still find
-- the right shipment even though it's no longer just the bare
-- vendor_order_id.
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS shiprocket_channel_order_id text;

CREATE INDEX IF NOT EXISTS idx_shipments_channel_order_id
  ON public.shipments(shiprocket_channel_order_id);

-- ===== [030/100] 20260824120000_refunds_table.sql =====
-- Real refund audit trail. Before this, "refund" only existed as
-- payments.refund_amount / return_requests.refund_amount - manually
-- editable numbers with no gateway call, no gateway refund id, and no
-- record of who issued it or when it actually processed. This table is
-- the source of truth for every refund attempt, successful or not.
CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  return_request_id uuid REFERENCES public.return_requests(id),
  -- Nullable: a refund issued directly from Razorpay's own dashboard
  -- (bypassing this app entirely) is still recorded via the webhook, with
  -- initiated_by left null and the reason noting it was external.
  initiated_by uuid REFERENCES auth.users(id),
  amount numeric NOT NULL CHECK (amount > 0),
  reason text,
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'processing', 'processed', 'failed')),
  razorpay_refund_id text,
  razorpay_payment_id text NOT NULL,
  speed text NOT NULL DEFAULT 'normal' CHECK (speed IN ('normal', 'instant')),
  failure_reason text,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  gateway_processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_refunds_payment_id ON public.refunds(payment_id);
CREATE INDEX idx_refunds_order_id ON public.refunds(order_id);
CREATE INDEX idx_refunds_razorpay_refund_id ON public.refunds(razorpay_refund_id);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

-- Admins see every refund.
CREATE POLICY "Admins view all refunds"
  ON public.refunds FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Vendors see refunds on orders that contain their own vendor's sale -
-- read-only, matching the confirmed decision that only admins can trigger
-- a real gateway refund. Reuses order_contains_vendor_sale (already
-- SECURITY DEFINER) rather than re-deriving the vendor_orders/orders join
-- here, which previously caused RLS recursion (42P17) on a similar policy.
CREATE POLICY "Vendors view refunds on their own sales"
  ON public.refunds FOR SELECT
  TO authenticated
  USING (public.order_contains_vendor_sale(order_id, auth.uid()));

-- Customers see refunds on their own orders.
CREATE POLICY "Customers view their own refunds"
  ON public.refunds FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = refunds.order_id AND o.user_id = auth.uid()
  ));

-- No authenticated write policy at all, by design - only the service-role
-- key (create-razorpay-refund, razorpay-webhook) can write here, same
-- lockdown pattern as shipments/shipment_events.

CREATE TRIGGER update_refunds_updated_at
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===== [031/100] 20260824130000_product_returnability.sql =====
-- Nothing anywhere in this schema could mark a product non-refundable
-- (e.g. innerwear, opened cosmetics) - every product was implicitly fully
-- refundable, governed only by the vendor's flat return_window_days.
--
-- is_returnable governs refund eligibility only, not exchange - a
-- non-returnable item can still be exchanged for a different size/colour,
-- per confirmed decision. It's a per-product flag (not per-category), also
-- per confirmed decision.
ALTER TABLE public.products ADD COLUMN is_returnable boolean NOT NULL DEFAULT true;

-- Snapshotted onto order_items at checkout, same pattern already used for
-- product_title/size/color/price on this table (a live join to products
-- would let a vendor's later policy change retroactively affect an order
-- placed under the old policy - unfair to the customer and legally
-- questionable, same reasoning price is snapshotted rather than joined).
ALTER TABLE public.order_items ADD COLUMN is_returnable boolean NOT NULL DEFAULT true;

-- ===== [032/100] 20260826100000_payment_events_disputes_settlements.sql =====
-- razorpay-webhook handled exactly two event types (refund.processed,
-- refund.failed) - everything else Razorpay sends (payment captured/
-- failed, order paid, disputes, settlements) was silently discarded with
-- no trace anywhere. These three tables give full coverage: a raw
-- append-only audit log of every event (mirrors shipment_events'
-- established pattern), plus two reconciled tables for the two event
-- categories that need an actual actionable lifecycle rather than just a
-- log line.

CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  razorpay_entity_id text,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_payment_events_dedupe
  ON public.payment_events(event_type, razorpay_entity_id)
  WHERE razorpay_entity_id IS NOT NULL;
CREATE INDEX idx_payment_events_order_id ON public.payment_events(order_id);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Admin-only - settlement rows have no coherent single-order/vendor scope
-- (one settlement batches many orders), and this is the raw sensitive
-- gateway feed kept for the record, not a customer/vendor-facing surface.
-- Customers/vendors still see accurate status through payments/orders/
-- refunds, which the webhook keeps up to date separately.
CREATE POLICY "Admins view payment events"
  ON public.payment_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No authenticated write policy at all, by design - service-role only,
-- same lockdown pattern as shipment_events/shipments/refunds.

CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_dispute_id text NOT NULL UNIQUE,
  payment_id uuid REFERENCES public.payments(id),
  order_id uuid REFERENCES public.orders(id),
  amount numeric NOT NULL,
  reason_code text,
  status text NOT NULL CHECK (status IN ('open', 'under_review', 'won', 'lost', 'closed')),
  respond_by timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view disputes"
  ON public.disputes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_settlement_id text NOT NULL UNIQUE,
  amount numeric NOT NULL,
  fees numeric,
  tax numeric,
  utr text,
  settled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view settlements"
  ON public.settlements FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ===== [033/100] 20260829090000_customer_avatar_upload_rls.sql =====
-- Customers could never upload their own avatar. ProfileSection.tsx has
-- always written to `${user.id}/avatar.ext` in the category-images bucket,
-- but the only write policies on this bucket were admin (anywhere) and
-- vendor members (vendor-uploads/ prefix only) - confirmed via
-- pg_policies, not assumed. No policy permitted a plain authenticated
-- user to write anywhere at all, so this failed for every non-admin,
-- non-vendor account, not an edge case.
--
-- Scoped narrowly: a user can only write under a top-level folder that
-- exactly matches their own auth.uid() - the same
-- (storage.foldername(name))[1] = '<prefix>' pattern already used for
-- vendor-uploads/, just keyed by identity instead of a fixed word.
CREATE POLICY "Users upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ===== [034/100] 20260829120000_order_cancellations.sql =====
-- No customer-facing order cancellation existed anywhere in this app -
-- confirmed via full-repo search, not assumed. This is the audit trail
-- for it, mirroring the refunds/disputes pattern already established.
CREATE TABLE public.order_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_order_id uuid NOT NULL REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  cancelled_by uuid REFERENCES auth.users(id),
  reason text,
  -- True when the courier had already picked up the shipment at
  -- cancellation time (Shiprocket refuses a clean cancel past that point)
  -- - the cancellation still goes through, but the vendor needs to know
  -- the physical package may still be in transit.
  was_already_shipped boolean NOT NULL DEFAULT false,
  refund_id uuid REFERENCES public.refunds(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_cancellations_order_id ON public.order_cancellations(order_id);
CREATE INDEX idx_order_cancellations_vendor_order_id ON public.order_cancellations(vendor_order_id);

ALTER TABLE public.order_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view their own order cancellations"
  ON public.order_cancellations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_cancellations.order_id AND o.user_id = auth.uid()
  ));

-- Reuses the existing SECURITY DEFINER helper rather than re-deriving a
-- fresh vendor_orders/orders join, which previously caused RLS recursion
-- (42P17) on a similar policy - see 20260820091500_fix_vendor_orders_rls_recursion.sql.
CREATE POLICY "Vendors view cancellations on their own sales"
  ON public.order_cancellations FOR SELECT
  TO authenticated
  USING (public.order_contains_vendor_sale(order_id, auth.uid()));

CREATE POLICY "Admins view all order cancellations"
  ON public.order_cancellations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No authenticated write policy at all, by design - only the service-role
-- key (cancel-vendor-order) writes here, same lockdown pattern as every
-- other audit table this session (refunds, disputes, settlements,
-- payment_events, shipment_events).

-- ===== [035/100] 20260829140000_shipment_estimated_delivery.sql =====
-- Shiprocket returns a real courier-promised delivery date (etd) at the
-- serviceability-check stage, already shown to the vendor in ShipNowDialog
-- before booking, but nothing has ever persisted it - discarded the moment
-- the vendor clicks to book. This is the only place it can live once a
-- shipment actually exists.
ALTER TABLE public.shipments ADD COLUMN estimated_delivery_date date;

-- ===== [036/100] 20260830090000_return_requests_vendor_visibility.sql =====
-- Vendors had zero visibility into returns/exchanges touching their own
-- products - confirmed absent, not just unbuilt (no RLS policy, no vendor
-- UI). return_requests.items is a JSON snapshot of order_item_ids (not a
-- live FK), so vendor attribution needs to unpack it and join through
-- order_items.vendor_id, mirroring the existing order_contains_vendor_sale
-- SECURITY DEFINER pattern used to avoid RLS recursion elsewhere.
CREATE OR REPLACE FUNCTION public.return_request_contains_vendor_item(_return_request_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.return_requests rr
    CROSS JOIN LATERAL jsonb_array_elements(rr.items) AS item
    JOIN public.order_items oi ON oi.id = (item->>'order_item_id')::uuid
    WHERE rr.id = _return_request_id
      AND public.is_vendor_member(_user_id, oi.vendor_id)
  )
$$;

GRANT EXECUTE ON FUNCTION public.return_request_contains_vendor_item(uuid, uuid) TO authenticated;

-- Additive alongside the existing customer/admin SELECT policies - a
-- vendor gets read visibility only, no new write/approval authority
-- (return/exchange approval stays admin-only, an already-settled decision).
CREATE POLICY "Vendors view return requests for their own items"
ON public.return_requests FOR SELECT
TO authenticated
USING (public.return_request_contains_vendor_item(id, auth.uid()));

-- ===== [037/100] 20260830100000_vendor_payouts_wiring.sql =====
-- vendor_payouts has existed since the original schema but nothing has ever
-- written to it - wiring it up as the real payout ledger. payout_id marks a
-- vendor_order as already settled (so a later run never double-counts it)
-- and gives a direct drill-down from a payout run to what's actually in it.
ALTER TABLE public.vendor_orders
  ADD COLUMN payout_id uuid REFERENCES public.vendor_payouts(id);

CREATE INDEX idx_vendor_orders_payout_id ON public.vendor_orders(payout_id);

-- Same convention settlements.utr already uses for Razorpay's own bank
-- reference - gives the vendor something concrete to reconcile against
-- their own bank statement once an admin marks a run paid.
ALTER TABLE public.vendor_payouts
  ADD COLUMN payment_reference text;

-- commission_amount/net_payable were computed client-side at checkout with
-- nothing server-side ever re-deriving or protecting them - a tampered
-- checkout request could set an arbitrary commission_amount, and it would
-- silently stick. Closing this now because Phase 2 makes these exact
-- numbers an explicit vendor-facing "transparent ledger" - they need to be
-- trustworthy before they're presented that way. Always recomputed from the
-- vendor's own current commission_rate, never from whatever the client sent.
CREATE OR REPLACE FUNCTION public.compute_vendor_order_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission_rate numeric;
BEGIN
  SELECT commission_rate INTO v_commission_rate
  FROM public.vendors WHERE id = NEW.vendor_id;

  v_commission_rate := COALESCE(v_commission_rate, 10);

  NEW.commission_rate := v_commission_rate;
  NEW.commission_amount := ROUND(NEW.subtotal * (v_commission_rate / 100), 2);
  NEW.net_payable := NEW.subtotal + NEW.shipping_cost - NEW.commission_amount;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS compute_vendor_order_commission_trigger ON public.vendor_orders;
CREATE TRIGGER compute_vendor_order_commission_trigger
  BEFORE INSERT ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.compute_vendor_order_commission();

-- ===== [038/100] 20260830110000_payments_vendor_visibility.sql =====
-- payments had no vendor-visibility policy at all - only the order owner
-- (customer) and admin could read it. Confirmed live: a vendor's own
-- authenticated client querying payments.gateway_fee for their own sale
-- returned zero rows (RLS silently filtering, not an error), making the
-- new vendor earnings breakdown's gateway-fee attribution always compute
-- to 0. Same fix already applied to refunds/order_cancellations for the
-- identical reason - reuses order_contains_vendor_sale (SECURITY DEFINER)
-- rather than re-deriving the vendor_orders/orders join here.
CREATE POLICY "Vendors view payments on their own sales"
  ON public.payments FOR SELECT
  TO authenticated
  USING (public.order_contains_vendor_sale(order_id, auth.uid()));

-- ===== [039/100] 20260830120000_invoices.sql =====
-- Structural v1: numbering, a real per-vendor document, download access -
-- not yet a fully GST-compliant tax invoice (no HSN/CGST/SGST/IGST split,
-- no confirmed platform/vendor GST registration model). tax_amount stays
-- 0 until those business inputs are supplied; the template itself says so.
--
-- One invoice per vendor_order (not per order) - each vendor is the legal
-- seller of their own goods in this marketplace, so each gets their own
-- numbered document rather than one consolidated invoice per order.
-- Seller/buyer details are snapshotted at issue time rather than joined
-- live later, since a legal document must reflect its issue-time state
-- even if the vendor's GSTIN or the customer's address changes afterward.
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  vendor_order_id uuid NOT NULL UNIQUE REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  subtotal numeric NOT NULL,
  shipping_cost numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL,
  seller_name text NOT NULL,
  seller_gstin text,
  seller_address jsonb,
  billing_name text NOT NULL,
  billing_address jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_order_id ON public.invoices(order_id);
CREATE INDEX idx_invoices_vendor_id ON public.invoices(vendor_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view invoices on their own orders"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = invoices.order_id AND o.user_id = auth.uid()
  ));

CREATE POLICY "Vendors view invoices on their own sales"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (public.order_contains_vendor_sale(order_id, auth.uid()));

CREATE POLICY "Admins view all invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No authenticated write policy - service-role only (generate-invoice
-- function), same lockdown as every other audit/document table this project.

-- A single global, monotonic sequence rather than a hand-rolled per-vendor
-- COUNT(*), which would race under concurrent generation. The human-
-- readable number still embeds the vendor's own slug for attribution -
-- only the raw integer is shared across vendors, not the visible number.
CREATE SEQUENCE public.invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_invoice_seq()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('public.invoice_number_seq');
$$;

-- ===== [040/100] 20260912120000_order_discount_snapshot.sql =====
-- Once an order was placed, which coupon (if any) was used and how much it
-- saved was completely lost - orders only ever stored subtotal/shipping/total,
-- never the discount itself. The only trace was discounts.used_count, a bare
-- global counter with no link back to which order used it. User's real
-- complaint: apply a coupon, place the order, and there's no record of it
-- anywhere afterward - not in order history, not on the invoice.
--
-- Snapshotted here rather than joined live later, matching every other
-- "what actually happened at checkout" fact in this schema (order_items'
-- product_title/price/sku, invoices' seller/billing details) - a coupon
-- being edited or deleted after the fact must never change what a past
-- order shows it used.
ALTER TABLE public.orders
  ADD COLUMN discount_code text,
  ADD COLUMN discount_amount numeric NOT NULL DEFAULT 0;

-- Applied at the whole-order level (one cart, one coupon), not per vendor -
-- shown on every vendor's invoice for that order as an order-level fact,
-- not prorated into this vendor's own line items. Prorating would imply a
-- specific vendor-funds-the-discount accounting policy that hasn't been
-- decided; showing the real order-level number avoids asserting one.
ALTER TABLE public.invoices
  ADD COLUMN discount_code text,
  ADD COLUMN discount_amount numeric NOT NULL DEFAULT 0;

-- ===== [041/100] 20260929100000_order_list_seen.sql =====
-- Per-user "I've looked at this status bucket" marker, backing the
-- notification-style badges on the Orders page status tabs (Pending,
-- Cancelled, etc. - not the "All Orders" total, which stays a real live
-- count). list_key is prefixed per page/role (e.g. "orders_admin:cancelled",
-- "orders_vendor:pending") so admin and vendor tracking never collide, and
-- each status tracks independently.
CREATE TABLE public.order_list_seen (
  user_id uuid NOT NULL,
  list_key text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list_key)
);

ALTER TABLE public.order_list_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own seen marks"
  ON public.order_list_seen FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===== [042/100] 20260929110000_vendor_boutique_code_and_toggles.sql =====
-- 1. Permanent boutique code - AB0001, AB0002, ... assigned once at
-- creation, shown to customers, never changes for the vendor's lifetime.
-- A plain sequence-backed column default (not a trigger) keeps assignment
-- atomic and gap-free under concurrent inserts.
CREATE SEQUENCE public.boutique_code_seq;

ALTER TABLE public.vendors
  ADD COLUMN boutique_code text UNIQUE
    DEFAULT ('AB' || LPAD(nextval('public.boutique_code_seq')::text, 4, '0'));

-- Backfill existing vendors in signup order, so the codes already in the
-- system stay stable and match how long each vendor has been on the
-- platform.
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN SELECT id FROM public.vendors WHERE boutique_code IS NULL ORDER BY created_at ASC LOOP
    UPDATE public.vendors
    SET boutique_code = 'AB' || LPAD(nextval('public.boutique_code_seq')::text, 4, '0')
    WHERE id = v.id;
  END LOOP;
END $$;

ALTER TABLE public.vendors ALTER COLUMN boutique_code SET NOT NULL;

-- 2. Per-vendor COD / returns kill switches - independent of the existing
-- per-product `products.is_returnable` (that one stays; this is the
-- vendor-wide override on top of it - an item is only actually returnable
-- if both are true).
ALTER TABLE public.vendors
  ADD COLUMN cod_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN returns_enabled boolean NOT NULL DEFAULT true;

-- boutique_code is permanent - immutable for every role, including admin,
-- not just protected from vendor self-edits like the other admin-only
-- columns below.
CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.boutique_code := OLD.boutique_code;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  NEW.is_trusted := OLD.is_trusted;
  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.owner_user_id := OLD.owner_user_id;

  IF NEW.payout_account_status <> 'pending' THEN
    NEW.payout_account_status := OLD.payout_account_status;
  END IF;

  RETURN NEW;
END;
$$;

-- ===== [043/100] 20260929120000_notifications.sql =====
-- Two-area notification system: "order" (new order, cancellation, return,
-- vendor confirmation, unconfirmed-order reminder) and "other" (a general
-- bucket for everything else, currently empty but wired and ready). Rows
-- are per-recipient, not per-event - a new order with 2 vendor items and
-- 1 admin produces up to 3 rows (one per vendor member, one per admin),
-- so each person's own unread count and mark-as-read state is independent.
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('order', 'other')),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link_url text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_id_created_at ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only mark-as-read (via read_at) is client-writable - the row's
-- existence/content is always system-generated (trigger or cron below),
-- same lockdown pattern as payments.payment_status.
CREATE POLICY "Users mark their own notifications read"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2-hour "still not confirmed" reminder needs a per-vendor_order marker so
-- the periodic check (below) never sends the same reminder twice.
ALTER TABLE public.vendor_orders ADD COLUMN reminder_sent_at timestamptz;

-- Shared helper: every admin's user_id, for notifications that go to the
-- whole admin team rather than one person.
CREATE OR REPLACE FUNCTION public.admin_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.user_roles WHERE role = 'admin';
$$;

-- 1. New order - one notification per vendor_order, fanned out to every
-- member of that vendor plus every admin.
CREATE OR REPLACE FUNCTION public.notify_new_vendor_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_name text;
  v_member_id uuid;
  v_admin_id uuid;
BEGIN
  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = NEW.vendor_id;

  FOR v_member_id IN SELECT user_id FROM public.vendor_members WHERE vendor_id = NEW.vendor_id LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (
      v_member_id, 'order', 'new_order',
      'New order received',
      format('A new order (₹%s) is waiting to be confirmed.', NEW.net_payable),
      '/vendor'
    );
  END LOOP;

  FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (
      v_admin_id, 'order', 'new_order',
      'New order placed',
      format('New order for %s.', coalesce(v_vendor_name, 'a vendor')),
      '/admin'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_vendor_order_trigger ON public.vendor_orders;
CREATE TRIGGER notify_new_vendor_order_trigger
  AFTER INSERT ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_vendor_order();

-- 2. Vendor confirms an order (pending -> confirmed) - admin gets notified
-- that the boutique acted on it.
CREATE OR REPLACE FUNCTION public.notify_order_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_name text;
  v_admin_id uuid;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = NEW.vendor_id;
    FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (
        v_admin_id, 'order', 'order_confirmed',
        'Vendor confirmed an order',
        format('%s confirmed an order.', coalesce(v_vendor_name, 'A vendor')),
        '/admin'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_order_confirmed_trigger ON public.vendor_orders;
CREATE TRIGGER notify_order_confirmed_trigger
  AFTER UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_confirmed();

-- 3. Cancellation - notify the affected vendor's team and every admin.
CREATE OR REPLACE FUNCTION public.notify_order_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id uuid;
  v_vendor_name text;
  v_member_id uuid;
  v_admin_id uuid;
BEGIN
  SELECT vendor_id INTO v_vendor_id FROM public.vendor_orders WHERE id = NEW.vendor_order_id;
  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_vendor_id;

  IF v_vendor_id IS NOT NULL THEN
    FOR v_member_id IN SELECT user_id FROM public.vendor_members WHERE vendor_id = v_vendor_id LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (
        v_member_id, 'order', 'order_cancelled',
        'An order was cancelled',
        NEW.reason,
        '/vendor'
      );
    END LOOP;
  END IF;

  FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (
      v_admin_id, 'order', 'order_cancelled',
      'An order was cancelled',
      format('%s - %s', coalesce(v_vendor_name, 'A vendor'), coalesce(NEW.reason, 'no reason given')),
      '/admin'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_order_cancellation_trigger ON public.order_cancellations;
CREATE TRIGGER notify_order_cancellation_trigger
  AFTER INSERT ON public.order_cancellations
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_cancellation();

-- 4. Return/exchange requested - return_requests.items is a JSON snapshot
-- of order_item_ids, not a live FK (same shape useReturnRequests.ts
-- already resolves client-side), so the affected vendor(s) are resolved
-- the same way here: join through order_items.
CREATE OR REPLACE FUNCTION public.notify_return_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id uuid;
  v_member_id uuid;
  v_admin_id uuid;
  v_label text;
BEGIN
  v_label := CASE WHEN NEW.request_type = 'exchange' THEN 'An exchange was requested' ELSE 'A return was requested' END;

  FOR v_vendor_id IN
    SELECT DISTINCT oi.vendor_id
    FROM public.order_items oi
    WHERE oi.id IN (
      SELECT (elem->>'order_item_id')::uuid
      FROM jsonb_array_elements(NEW.items) AS elem
    )
    AND oi.vendor_id IS NOT NULL
  LOOP
    FOR v_member_id IN SELECT user_id FROM public.vendor_members WHERE vendor_id = v_vendor_id LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (v_member_id, 'order', 'return_requested', v_label, NEW.reason, '/vendor');
    END LOOP;
  END LOOP;

  FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (v_admin_id, 'order', 'return_requested', v_label, NEW.reason, '/admin');
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_return_request_trigger ON public.return_requests;
CREATE TRIGGER notify_return_request_trigger
  AFTER INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_return_request();

-- 5. "Still unconfirmed after 2 hours" - time-based, not event-driven, so
-- this is the one piece that genuinely needs a scheduler rather than a
-- trigger. reminder_sent_at guards against sending the same reminder
-- again on every cron tick.
CREATE OR REPLACE FUNCTION public.remind_unconfirmed_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_vendor_name text;
  v_admin_id uuid;
BEGIN
  FOR v_row IN
    SELECT id, vendor_id, order_id
    FROM public.vendor_orders
    WHERE status = 'pending'
      AND created_at < now() - interval '2 hours'
      AND reminder_sent_at IS NULL
  LOOP
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_row.vendor_id;
    FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (
        v_admin_id, 'order', 'unconfirmed_reminder',
        'Order still unconfirmed after 2 hours',
        format('%s has not confirmed an order placed over 2 hours ago.', coalesce(v_vendor_name, 'A vendor')),
        '/admin'
      );
    END LOOP;
    UPDATE public.vendor_orders SET reminder_sent_at = now() WHERE id = v_row.id;
  END LOOP;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'remind-unconfirmed-orders',
  '*/15 * * * *',
  $$SELECT public.remind_unconfirmed_orders();$$
);

-- ===== [044/100] 20261004100000_backfill_courier_cancelled_shipments.sql =====
-- Re-derive shipment status for rows the old webhook mapping got wrong,
-- from each shipment's latest recorded event. Only shipment rows change - a
-- courier cancellation never cancels the customer's order.
--
-- 1. Shiprocket's auto-cancel after failed pickups arrives as current_status
--    "NEW" with the AWB released (awb_assigned_date null), which the old
--    mapping stored as a fresh "pending" booking while still showing the
--    dead AWB. These become cancelled, with the courier's reason kept.
-- 2. Free-text cancel/pickup labels that fell through to in_transit.
CREATE TEMP TABLE courier_backfill ON COMMIT DROP AS
WITH latest AS (
  SELECT DISTINCT ON (shipment_id) shipment_id, event_status, raw_payload
  FROM public.shipment_events
  WHERE shipment_id IS NOT NULL AND event_status IS NOT NULL
  ORDER BY shipment_id, event_timestamp DESC NULLS LAST, received_at DESC
)
SELECT
  s.id AS shipment_id,
  s.vendor_order_id,
  s.awb_code,
  CASE
    WHEN upper(l.event_status) = 'NEW' THEN 'cancelled'
    WHEN upper(l.event_status) LIKE '%CANCEL%' THEN 'cancelled'
    ELSE 'pickup_scheduled'
  END AS new_status,
  CASE
    WHEN upper(l.event_status) = 'NEW' THEN
      'Pickup cancelled by courier'
      || coalesce(' - ' || nullif(l.raw_payload->>'pickup_exception_reason', ''), '')
    ELSE l.event_status
  END AS new_status_raw
FROM public.shipments s
JOIN latest l ON l.shipment_id = s.id
WHERE s.shipment_type IN ('forward', 'exchange_forward')
  AND s.status <> 'cancelled'
  AND (
    (
      upper(l.event_status) = 'NEW'
      AND s.awb_code IS NOT NULL
      AND coalesce(l.raw_payload->>'awb_assigned_date', '') = ''
    )
    OR (
      s.status = 'in_transit'
      AND (upper(l.event_status) LIKE '%CANCEL%' OR upper(l.event_status) LIKE '%PICKUP%')
      AND upper(l.event_status) NOT LIKE '%RTO%'
      AND upper(l.event_status) NOT LIKE '%NDR%'
    )
  );

UPDATE public.shipments s
SET status = b.new_status, status_raw = b.new_status_raw
FROM courier_backfill b
WHERE b.shipment_id = s.id;

-- Same bell notification the webhook now sends, so a boutique with a dead
-- booking from before this fix finds out it has to book again.
INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
SELECT recipient.user_id, 'order', 'pickup_cancelled', 'Courier pickup cancelled',
       format('%s (AWB %s) for order #%s. Please book the shipment again.',
              b.new_status_raw, b.awb_code, upper(left(b.vendor_order_id::text, 8))),
       recipient.link_url
FROM courier_backfill b
JOIN public.vendor_orders vo ON vo.id = b.vendor_order_id
CROSS JOIN LATERAL (
  SELECT vm.user_id, '/vendor'::text AS link_url FROM public.vendor_members vm WHERE vm.vendor_id = vo.vendor_id
  UNION
  SELECT a.user_id, '/admin'::text FROM public.admin_user_ids() AS a(user_id)
) recipient
WHERE b.new_status = 'cancelled';

-- ===== [045/100] 20261004110000_vendor_verified_badge.sql =====
-- "Verified Boutique" badge: off until an admin turns it on, and shown to
-- customers only while it's on.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Admin-only fields were only protected on UPDATE, but applicants INSERT
-- their own vendor row (the "Users can apply" policy only checks
-- status = 'pending'), so an applicant could create a row already marked
-- trusted/verified or with its own commission rate. Reset those on insert
-- for non-admins too.
CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      NEW.is_trusted := false;
      NEW.is_verified := false;
      NEW.commission_rate := 10;
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  NEW.boutique_code := OLD.boutique_code;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  NEW.is_trusted := OLD.is_trusted;
  NEW.is_verified := OLD.is_verified;
  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.owner_user_id := OLD.owner_user_id;

  IF NEW.payout_account_status <> 'pending' THEN
    NEW.payout_account_status := OLD.payout_account_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_vendor_admin_fields_trigger ON public.vendors;
CREATE TRIGGER protect_vendor_admin_fields_trigger
  BEFORE INSERT OR UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.protect_vendor_admin_fields();

-- ===== [046/100] 20261004120000_vendor_quality_tags.sql =====
-- Internal performance/quality grade per boutique (A++ ... C), assigned
-- during registration review and changed later. Kept in its own admin-only
-- table rather than on vendors, because vendors rows are publicly readable
-- for approved stores and a column there would expose the grade via the API.
CREATE TABLE public.vendor_quality_tags (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  tag text NOT NULL CHECK (tag IN ('A++', 'A+', 'A', 'B+', 'B', 'C')),
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_quality_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage vendor quality tags"
  ON public.vendor_quality_tags FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_vendor_quality_tags_updated_at
  BEFORE UPDATE ON public.vendor_quality_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== [047/100] 20261004130000_product_ai_declaration.sql =====
-- AI content declaration chosen during product listing. NULL means the
-- listing predates the declaration (legacy) - the listing forms require a
-- choice on every new save, so NULL only survives on untouched old rows.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ai_content_status text
    CHECK (ai_content_status IN ('none', 'ai_enhanced', 'ai_model', 'fully_ai'));

-- ===== [048/100] 20261004140000_product_ai_original_photos.sql =====
-- Original real-product photos a boutique must supply when it declares AI
-- imagery, so admins can check the product exists and matches. They're for
-- verification only, so they live in a PRIVATE bucket (not the public
-- category-images bucket every listing image uses): only the owning
-- boutique's members and admins can read them, via short-lived signed URLs.
-- Paths are stored as <vendor_id or "platform">/<file>.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ai_original_photo_paths text[] NOT NULL DEFAULT '{}';

-- Backstop for the form-level check: an AI-declared listing can't be saved
-- without at least one original. NULL (legacy, undeclared) and 'none' are fine.
ALTER TABLE public.products
  ADD CONSTRAINT products_ai_original_photo_required
  CHECK (
    ai_content_status IS NULL
    OR ai_content_status = 'none'
    OR cardinality(ai_original_photo_paths) > 0
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-originals', 'product-originals', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_product_original(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.vendor_members vm
      WHERE vm.user_id = _user_id
        AND vm.vendor_id::text = (storage.foldername(_object_name))[1]
    );
$$;

CREATE POLICY "Product originals: owning boutique and admins can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-originals' AND public.can_access_product_original(auth.uid(), name));

CREATE POLICY "Product originals: owning boutique and admins can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-originals' AND public.can_access_product_original(auth.uid(), name));

CREATE POLICY "Product originals: owning boutique and admins can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-originals' AND public.can_access_product_original(auth.uid(), name));

-- ===== [049/100] 20261004150000_review_images_and_platform_settings.sql =====
-- Single-row admin settings for marketplace-wide switches. Readable by
-- everyone (none of it is sensitive and the storefront needs some of it,
-- e.g. to tell a reviewer their photos await approval); only admins write.
CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  review_images_require_approval boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.platform_settings (id) VALUES (true);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read platform settings"
  ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Admins update platform settings"
  ON public.platform_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Customer photos attached to a review (after receiving / wearing it).
CREATE TABLE public.review_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.product_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_images_review_id ON public.review_images(review_id);
CREATE INDEX idx_review_images_pending ON public.review_images(created_at) WHERE status = 'pending';

ALTER TABLE public.review_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view approved review images"
  ON public.review_images FOR SELECT
  USING (
    status = 'approved'
    AND EXISTS (SELECT 1 FROM public.product_reviews r WHERE r.id = review_id AND r.is_approved)
  );
CREATE POLICY "Reviewers see their own review images"
  ON public.review_images FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Reviewers add images to their own review"
  ON public.review_images FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.product_reviews r WHERE r.id = review_id AND r.user_id = auth.uid())
  );
CREATE POLICY "Reviewers delete their own review images"
  ON public.review_images FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage review images"
  ON public.review_images FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Approval state is decided here, from the admin switch, never by the client.
CREATE OR REPLACE FUNCTION public.set_review_image_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.status := CASE
    WHEN (SELECT review_images_require_approval FROM public.platform_settings WHERE id) THEN 'pending'
    ELSE 'approved'
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_review_image_status_trigger
  BEFORE INSERT ON public.review_images
  FOR EACH ROW EXECUTE FUNCTION public.set_review_image_status();

-- Review integrity: customers could set is_verified_purchase themselves and
-- re-approve a review an admin hid (the update policy allowed any column).
-- Verified purchase is now derived from a real delivered order of the product.
CREATE OR REPLACE FUNCTION public.protect_product_review_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_approved := true;
    NEW.helpful_count := 0;
    NEW.is_verified_purchase := EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      LEFT JOIN public.vendor_orders vo ON vo.id = oi.vendor_order_id
      WHERE o.user_id = NEW.user_id
        AND oi.product_id = NEW.product_id
        AND (o.order_status = 'delivered' OR vo.status = 'delivered')
    );
  ELSE
    NEW.is_approved := OLD.is_approved;
    NEW.is_verified_purchase := OLD.is_verified_purchase;
    NEW.helpful_count := OLD.helpful_count;
    NEW.user_id := OLD.user_id;
    NEW.product_id := OLD.product_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_product_review_fields_trigger
  BEFORE INSERT OR UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_product_review_fields();

-- ===== [050/100] 20261004150100_fix_review_verified_purchase_cast.sql =====
-- order_items.product_id is text while product_reviews.product_id is uuid,
-- so the verified-purchase check in the previous migration raised
-- "operator does not exist: text = uuid" and blocked every review insert.
CREATE OR REPLACE FUNCTION public.protect_product_review_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_approved := true;
    NEW.helpful_count := 0;
    NEW.is_verified_purchase := EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      LEFT JOIN public.vendor_orders vo ON vo.id = oi.vendor_order_id
      WHERE o.user_id = NEW.user_id
        AND oi.product_id = NEW.product_id::text
        AND (o.order_status = 'delivered' OR vo.status = 'delivered')
    );
  ELSE
    NEW.is_approved := OLD.is_approved;
    NEW.is_verified_purchase := OLD.is_verified_purchase;
    NEW.helpful_count := OLD.helpful_count;
    NEW.user_id := OLD.user_id;
    NEW.product_id := OLD.product_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ===== [051/100] 20261004160000_return_evidence.sql =====
-- Return/exchange evidence: several photos per item (items[].photo_urls,
-- with items[].photo_url kept as the first for older rows/readers) plus one
-- optional video per request. Admins choose whether photo evidence is
-- mandatory; default true matches the previous always-required behaviour.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS return_evidence_required boolean NOT NULL DEFAULT true;

ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS evidence_video_url text;

-- The form enforces this too; this stops a direct API insert skipping it.
CREATE OR REPLACE FUNCTION public.enforce_return_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF (SELECT return_evidence_required FROM public.platform_settings WHERE id)
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) AS it
       WHERE coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(it->'photo_urls') = 'array' THEN it->'photo_urls' END), 0) = 0
         AND coalesce(it->>'photo_url', '') = ''
     ) THEN
    RAISE EXCEPTION 'Photo evidence is required for every item in a return or exchange request'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_return_evidence_trigger
  BEFORE INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_return_evidence();

-- ===== [052/100] 20261004170000_return_vendor_first_workflow.sql =====
-- Return workflow: a request goes to the boutique first; if the boutique
-- doesn't accept or reject it within the admin-configured SLA, it escalates
-- to Admin automatically. Requests whose items span several boutiques (or
-- none) can't belong to one boutique, so they start with Admin.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS return_vendor_sla_hours integer NOT NULL DEFAULT 48
    CHECK (return_vendor_sla_hours BETWEEN 1 AND 720);

ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS handled_by text NOT NULL DEFAULT 'vendor'
    CHECK (handled_by IN ('vendor', 'admin')),
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_notes text;

-- Anything already in the system was handled under the old admin-only flow.
UPDATE public.return_requests SET handled_by = 'admin';

-- The one boutique all of a request's items belong to, or NULL.
CREATE OR REPLACE FUNCTION public.return_request_items_sole_vendor(_items jsonb)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN count(DISTINCT oi.vendor_id) = 1 AND bool_and(oi.vendor_id IS NOT NULL)
              THEN (array_agg(oi.vendor_id))[1] END
  FROM public.order_items oi
  WHERE oi.id IN (
    SELECT (elem->>'order_item_id')::uuid FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) AS elem
  );
$$;

CREATE OR REPLACE FUNCTION public.return_request_sole_vendor(_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.return_request_items_sole_vendor(items) FROM public.return_requests WHERE id = _request_id;
$$;

-- Routing is decided server-side on insert, never by the client.
CREATE OR REPLACE FUNCTION public.route_new_return_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.handled_by := CASE WHEN public.return_request_items_sole_vendor(NEW.items) IS NULL THEN 'admin' ELSE 'vendor' END;
  NEW.escalated_at := NULL;
  NEW.vendor_decision_at := NULL;
  NEW.vendor_notes := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS route_new_return_request_trigger ON public.return_requests;
CREATE TRIGGER route_new_return_request_trigger
  BEFORE INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.route_new_return_request();

-- New-request alert goes to whoever handles it first: the boutique, or the
-- admins when it starts with Admin. Admins hear about boutique requests on
-- escalation instead.
CREATE OR REPLACE FUNCTION public.notify_return_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id uuid;
  v_member_id uuid;
  v_admin_id uuid;
  v_label text;
  v_sla integer;
BEGIN
  v_label := CASE WHEN NEW.request_type = 'exchange' THEN 'An exchange was requested' ELSE 'A return was requested' END;

  IF NEW.handled_by = 'vendor' THEN
    SELECT return_vendor_sla_hours INTO v_sla FROM public.platform_settings WHERE id;
    v_vendor_id := public.return_request_items_sole_vendor(NEW.items);
    FOR v_member_id IN SELECT user_id FROM public.vendor_members WHERE vendor_id = v_vendor_id LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (v_member_id, 'order', 'return_requested', v_label,
              format('%s - please accept or reject within %s hours, or it goes to the AllBoutiqs team.', NEW.reason, v_sla),
              '/vendor');
    END LOOP;
  ELSE
    FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (v_admin_id, 'order', 'return_requested', v_label, NEW.reason, '/admin');
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- The boutique's only write path: accept or reject its own pending request
-- while it's still with the boutique. Courier booking and the customer email
-- follow from the client exactly as for an admin decision.
CREATE OR REPLACE FUNCTION public.vendor_respond_to_return(_request_id uuid, _decision text, _note text DEFAULT NULL)
RETURNS public.return_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.return_requests;
  v_vendor uuid;
BEGIN
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  SELECT * INTO v_request FROM public.return_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return request not found';
  END IF;

  v_vendor := public.return_request_items_sole_vendor(v_request.items);
  IF v_vendor IS NULL OR NOT public.is_vendor_member(auth.uid(), v_vendor) THEN
    RAISE EXCEPTION 'You can only respond to return requests for your own boutique';
  END IF;
  IF v_request.handled_by <> 'vendor' THEN
    RAISE EXCEPTION 'This request has been escalated to the AllBoutiqs team';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been answered';
  END IF;

  UPDATE public.return_requests
  SET status = _decision,
      vendor_notes = nullif(trim(coalesce(_note, '')), ''),
      vendor_decision_at = now()
  WHERE id = _request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_respond_to_return(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendor_respond_to_return(uuid, text, text) TO authenticated;

-- Hand overdue boutique requests to Admin and tell both sides.
CREATE OR REPLACE FUNCTION public.escalate_overdue_return_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sla integer;
  v_row record;
  v_vendor uuid;
  v_member_id uuid;
  v_admin_id uuid;
  v_ref text;
BEGIN
  SELECT return_vendor_sla_hours INTO v_sla FROM public.platform_settings WHERE id;

  FOR v_row IN
    UPDATE public.return_requests
    SET handled_by = 'admin', escalated_at = now()
    WHERE handled_by = 'vendor'
      AND status = 'pending'
      AND created_at < now() - make_interval(hours => v_sla)
    RETURNING id, items, request_type
  LOOP
    v_ref := upper(left(v_row.id::text, 8));
    v_vendor := public.return_request_items_sole_vendor(v_row.items);

    FOR v_admin_id IN SELECT * FROM public.admin_user_ids() LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (v_admin_id, 'order', 'return_escalated',
              format('%s request #%s escalated', initcap(v_row.request_type), v_ref),
              format('The boutique did not respond within %s hours. It now needs your decision.', v_sla),
              '/admin');
    END LOOP;

    FOR v_member_id IN SELECT user_id FROM public.vendor_members WHERE vendor_id = v_vendor LOOP
      INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
      VALUES (v_member_id, 'order', 'return_escalated',
              format('%s request #%s moved to AllBoutiqs', initcap(v_row.request_type), v_ref),
              format('No response within %s hours, so the AllBoutiqs team will decide this request.', v_sla),
              '/vendor');
    END LOOP;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'escalate-overdue-returns',
  '*/15 * * * *',
  $$SELECT public.escalate_overdue_return_requests();$$
);

-- ===== [053/100] 20261004180000_product_video.sql =====
-- Optional product video. Shown to shoppers only once approved: either as
-- the first/front media (video_is_primary) or, when an image leads, as a
-- compact highlight frame over it.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS video_is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_status text
    CHECK (video_status IN ('pending', 'approved', 'rejected'));

-- Approval is decided here, never by the client: admins' and trusted
-- partners' videos are approved (same rule as their listings publishing
-- instantly); everyone else's wait for admin review. Non-admins can't set
-- the status directly.
CREATE OR REPLACE FUNCTION public.set_product_video_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := public.has_role(auth.uid(), 'admin');
  v_trusted boolean;
  v_changed boolean := TG_OP = 'INSERT' OR NEW.video_url IS DISTINCT FROM OLD.video_url;
BEGIN
  IF NEW.video_url IS NULL OR btrim(NEW.video_url) = '' THEN
    NEW.video_url := NULL;
    NEW.video_status := NULL;
    NEW.video_is_primary := false;
    RETURN NEW;
  END IF;

  IF v_is_admin THEN
    IF v_changed AND (TG_OP = 'INSERT' OR NEW.video_status IS NOT DISTINCT FROM OLD.video_status) THEN
      NEW.video_status := 'approved';
    END IF;
    RETURN NEW;
  END IF;

  IF v_changed THEN
    SELECT is_trusted INTO v_trusted FROM public.vendors WHERE id = NEW.vendor_id;
    NEW.video_status := CASE WHEN coalesce(v_trusted, false) THEN 'approved' ELSE 'pending' END;
  ELSE
    NEW.video_status := OLD.video_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_product_video_status_trigger
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_product_video_status();

-- ===== [054/100] 20261004180100_admin_guards_trust_service_role.sql =====
-- The admin-field guards checked only has_role(auth.uid(), 'admin'), so the
-- backend's own service-role key (auth.uid() is NULL) was treated like an
-- untrusted user: its writes to admin-only fields were silently reverted.
-- Any server-side job setting these would no-op. Trust service_role
-- explicitly (not "no user", which also covers anonymous requests).
CREATE OR REPLACE FUNCTION public.is_privileged_writer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.role() = 'service_role', false) OR public.has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_privileged_writer() THEN
      NEW.is_trusted := false;
      NEW.is_verified := false;
      NEW.commission_rate := 10;
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  NEW.boutique_code := OLD.boutique_code;

  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  NEW.is_trusted := OLD.is_trusted;
  NEW.is_verified := OLD.is_verified;
  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.owner_user_id := OLD.owner_user_id;

  IF NEW.payout_account_status <> 'pending' THEN
    NEW.payout_account_status := OLD.payout_account_status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_video_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_privileged boolean := public.is_privileged_writer();
  v_trusted boolean;
  v_changed boolean := TG_OP = 'INSERT' OR NEW.video_url IS DISTINCT FROM OLD.video_url;
BEGIN
  IF NEW.video_url IS NULL OR btrim(NEW.video_url) = '' THEN
    NEW.video_url := NULL;
    NEW.video_status := NULL;
    NEW.video_is_primary := false;
    RETURN NEW;
  END IF;

  -- Privileged writers may set the status explicitly; a new video they add
  -- without choosing one is approved.
  IF v_privileged THEN
    IF TG_OP = 'INSERT' THEN
      NEW.video_status := coalesce(NEW.video_status, 'approved');
    ELSIF v_changed AND NEW.video_status IS NOT DISTINCT FROM OLD.video_status THEN
      NEW.video_status := 'approved';
    END IF;
    RETURN NEW;
  END IF;

  IF v_changed THEN
    SELECT is_trusted INTO v_trusted FROM public.vendors WHERE id = NEW.vendor_id;
    NEW.video_status := CASE WHEN coalesce(v_trusted, false) THEN 'approved' ELSE 'pending' END;
  ELSE
    NEW.video_status := OLD.video_status;
  END IF;
  RETURN NEW;
END;
$$;

-- ===== [055/100] 20261006100000_vendor_payout_schedule_on_delivery.sql =====
-- When a vendor order is delivered, schedule its payout and tell the
-- boutique (bell + email). Payout date = the later of:
--   * delivery date + the boutique's return window, or the delivery date
--     itself when nothing in it can be returned (non-returnable items, or
--     the boutique has returns switched off);
--   * for online (Razorpay) payments, the payment date + Razorpay's
--     settlement time in working days (admin-configurable, default T+2).
-- If the boutique hasn't added a payout account yet, it's told to set one
-- up instead. Payout runs (generate-vendor-payouts) only pick orders up
-- once this date has arrived.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS payout_settlement_days integer NOT NULL DEFAULT 2
    CHECK (payout_settlement_days BETWEEN 0 AND 30);

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_eligible_on date,
  ADD COLUMN IF NOT EXISTS payout_notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.add_business_days(_d date, _n integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d date := _d;
  added integer := 0;
BEGIN
  WHILE added < _n LOOP
    d := d + 1;
    IF extract(isodow FROM d) < 6 THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- Days the payout waits after delivery: the boutique's return window if
-- anything in this vendor order can still be returned, otherwise 0.
CREATE OR REPLACE FUNCTION public.vendor_order_payout_hold_days(_vendor_order_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(v.returns_enabled, true)
     AND EXISTS (
       SELECT 1 FROM public.order_items oi
       WHERE oi.vendor_order_id = vo.id AND oi.is_returnable
     )
    THEN coalesce(v.return_window_days, 7)
    ELSE 0
  END
  FROM public.vendor_orders vo
  JOIN public.vendors v ON v.id = vo.vendor_id
  WHERE vo.id = _vendor_order_id;
$$;

CREATE OR REPLACE FUNCTION public.vendor_order_payout_date(_vendor_order_id uuid, _delivered_at timestamptz)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_delivered date := (_delivered_at AT TIME ZONE 'Asia/Kolkata')::date;
  v_method text;
  v_paid_at timestamptz;
  v_settle integer;
  v_money_ready date;
BEGIN
  SELECT order_id INTO v_order_id FROM public.vendor_orders WHERE id = _vendor_order_id;
  SELECT payment_method INTO v_method FROM public.orders WHERE id = v_order_id;
  SELECT payout_settlement_days INTO v_settle FROM public.platform_settings WHERE id;

  -- Cash on delivery has no Razorpay leg; its money is in hand at delivery.
  IF v_method IS DISTINCT FROM 'cod' THEN
    SELECT min(created_at) INTO v_paid_at
    FROM public.payments
    WHERE order_id = v_order_id AND payment_status IN ('paid', 'partially_refunded', 'refunded');
  END IF;

  v_money_ready := CASE
    WHEN v_paid_at IS NULL THEN v_delivered
    ELSE public.add_business_days((v_paid_at AT TIME ZONE 'Asia/Kolkata')::date, coalesce(v_settle, 2))
  END;

  RETURN greatest(v_delivered + coalesce(public.vendor_order_payout_hold_days(_vendor_order_id), 0), v_money_ready);
END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_vendor_order_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := coalesce(NEW.delivered_at, now());
    NEW.payout_eligible_on := public.vendor_order_payout_date(NEW.id, NEW.delivered_at);
    -- Notify only on the first delivery of this vendor order.
    IF OLD.payout_notified_at IS NULL THEN
      NEW.payout_notified_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_vendor_order_delivery_trigger ON public.vendor_orders;
CREATE TRIGGER stamp_vendor_order_delivery_trigger
  BEFORE UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_vendor_order_delivery();

-- Calls an edge function from the database. The project URL and service
-- key live in Supabase Vault (secrets "project_url" / "service_role_key",
-- created once outside migrations so the key is never in the repo).
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_edge_function(_name text, _body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'invoke_edge_function: Vault secrets project_url/service_role_key missing, % not called', _name;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || _name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := _body
  );
END;
$$;

-- Server-side only: a client able to call this could fire service-role
-- requests at any edge function.
REVOKE ALL ON FUNCTION public.invoke_edge_function(text, jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_vendor_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_account boolean;
  v_hold integer;
  v_ref text := '#' || left(NEW.order_id::text, 8);
  v_amount text := '₹' || to_char(round(NEW.net_payable), 'FM99999999990');
  v_date text := to_char(NEW.payout_eligible_on, 'DD Mon YYYY');
  v_title text;
  v_body text;
  v_type text;
  v_member uuid;
BEGIN
  IF NOT (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered'
          AND OLD.payout_notified_at IS NULL AND NEW.payout_notified_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = NEW.vendor_id);
  v_hold := coalesce(public.vendor_order_payout_hold_days(NEW.id), 0);

  IF v_has_account THEN
    v_type := 'payout_scheduled';
    v_title := 'Order delivered - payout scheduled';
    v_body := format('Order %s was delivered. Your payout of %s is scheduled for %s %s.',
      v_ref, v_amount, v_date,
      CASE WHEN v_hold > 0 THEN format('(after the %s-day return window)', v_hold)
           ELSE '(non-returnable, so no return-window wait)' END);
  ELSE
    v_type := 'payout_account_missing';
    v_title := 'Order delivered - add your payout account';
    v_body := format('Order %s was delivered and %s is due to you on %s, but your payout account is not set up yet. Add your bank details so we can pay you.',
      v_ref, v_amount, v_date);
  END IF;

  FOR v_member IN SELECT user_id FROM public.vendor_members WHERE vendor_id = NEW.vendor_id LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (v_member, 'order', v_type, v_title, v_body, '/vendor?tab=payouts');
  END LOOP;

  PERFORM public.invoke_edge_function('send-vendor-payout-email', jsonb_build_object('vendor_order_id', NEW.id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_vendor_order_delivered_trigger ON public.vendor_orders;
CREATE TRIGGER notify_vendor_order_delivered_trigger
  AFTER UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_vendor_order_delivered();

-- Existing deliveries: record when they were delivered and when they become
-- payable, without notifying anyone retroactively.
UPDATE public.vendor_orders vo
SET delivered_at = coalesce(
      (SELECT max(s.delivered_at) FROM public.shipments s WHERE s.vendor_order_id = vo.id AND s.delivered_at IS NOT NULL),
      vo.updated_at),
    payout_notified_at = coalesce(vo.payout_notified_at, now())
WHERE vo.status = 'delivered' AND vo.delivered_at IS NULL;

UPDATE public.vendor_orders
SET payout_eligible_on = public.vendor_order_payout_date(id, delivered_at)
WHERE status = 'delivered' AND payout_eligible_on IS NULL;

-- ===== [056/100] 20261006100100_fix_pickup_cancelled_order_ref.sql =====
-- Pickup-cancelled alerts quoted the internal vendor-order id ("#FA180432"),
-- which boutiques never see; their Orders list shows the customer order id.
-- Rewrite already-sent alerts to the order number they can actually find.
UPDATE public.notifications n
SET body = replace(n.body, '#' || upper(left(vo.id::text, 8)), '#' || left(vo.order_id::text, 8))
FROM public.vendor_orders vo
WHERE n.type = 'pickup_cancelled'
  AND n.body LIKE '%#' || upper(left(vo.id::text, 8)) || '%';

-- ===== [057/100] 20261006110000_payout_lifecycle.sql =====
-- Full payout lifecycle for boutiques, with a bell alert + email on every
-- event (via invoke_edge_function -> send-vendor-payout-email):
--   delivered -> (return window) -> queued -> processing (in a payout run)
--   -> credited (admin records the bank UTR) or declined by the bank
--   (admin records why; the money goes back to the queue and the account
--   is flagged until the boutique updates its bank details).
-- Boutiques without usable bank details are skipped by payout runs (their
-- money waits in the queue) and reminded weekly.

-- Account status: 'needs_update' = the bank declined the last transfer.
ALTER TABLE public.vendors DROP CONSTRAINT vendors_payout_account_status_check;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_payout_account_status_check
  CHECK (payout_account_status IN ('not_setup', 'pending', 'active', 'needs_update', 'disabled'));

UPDATE public.vendors v SET payout_account_status = 'pending'
WHERE payout_account_status = 'not_setup'
  AND EXISTS (SELECT 1 FROM public.vendor_payout_accounts a WHERE a.vendor_id = v.id);

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS payout_reminder_sent_at timestamptz;

ALTER TABLE public.vendor_payouts
  ADD COLUMN IF NOT EXISTS order_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_order_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bank_account_last4 text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS due_notified_at timestamptz;

-- Server-side helpers (not callable by clients).
CREATE OR REPLACE FUNCTION public.notify_vendor_members(_vendor_id uuid, _type text, _title text, _body text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
  SELECT user_id, 'order', _type, _title, _body, '/vendor?tab=payouts'
  FROM public.vendor_members WHERE vendor_id = _vendor_id;
$$;
REVOKE ALL ON FUNCTION public.notify_vendor_members(uuid, text, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.vendor_bank_last4(_vendor_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT right(regexp_replace(bank_account_number, '\s', '', 'g'), 4)
  FROM public.vendor_payout_accounts WHERE vendor_id = _vendor_id;
$$;
REVOKE ALL ON FUNCTION public.vendor_bank_last4(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.inr(_amount numeric)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT '₹' || to_char(round(_amount), 'FM99999999990');
$$;

-- Payout status rules: proof required, final states stay final.
CREATE OR REPLACE FUNCTION public.guard_vendor_payout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.bank_account_last4 := coalesce(NEW.bank_account_last4, public.vendor_bank_last4(NEW.vendor_id));
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'This payout is already %', CASE OLD.status WHEN 'paid' THEN 'credited' ELSE 'declined' END;
  END IF;

  IF NEW.status = 'paid' THEN
    IF coalesce(btrim(NEW.payment_reference), '') = '' THEN
      RAISE EXCEPTION 'Enter the bank transfer reference (UTR) to mark this payout credited';
    END IF;
    NEW.paid_at := coalesce(NEW.paid_at, now());
    NEW.bank_account_last4 := coalesce(public.vendor_bank_last4(NEW.vendor_id), NEW.bank_account_last4);
    NEW.failure_reason := NULL;
  ELSIF NEW.status = 'failed' THEN
    IF coalesce(btrim(NEW.failure_reason), '') = '' THEN
      RAISE EXCEPTION 'Enter why the bank declined the transfer';
    END IF;
    NEW.failed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_vendor_payout_trigger ON public.vendor_payouts;
CREATE TRIGGER guard_vendor_payout_trigger
  BEFORE INSERT OR UPDATE ON public.vendor_payouts
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_payout();

CREATE OR REPLACE FUNCTION public.vendor_payout_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acct text := coalesce(' ending ' || NEW.bank_account_last4, '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_processing', 'Payout processing',
      format('We''ve started the bank transfer of %s for %s order(s) to your account%s.',
             public.inr(NEW.net_payable), NEW.order_count, v_acct));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'processing', 'payout_id', NEW.id));
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' THEN
    UPDATE public.vendors SET payout_account_status = 'active'
    WHERE id = NEW.vendor_id AND payout_account_status IN ('pending', 'needs_update');
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_credited', 'Payout credited',
      format('%s was credited to your account%s. Bank reference (UTR): %s.',
             public.inr(NEW.net_payable), v_acct, NEW.payment_reference));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'credited', 'payout_id', NEW.id));
  ELSIF NEW.status = 'failed' THEN
    -- The money is still owed: put the orders back in the queue (already
    -- told, so the daily "queued" alert doesn't repeat) for the next run.
    UPDATE public.vendor_orders
    SET payout_id = NULL, due_notified_at = coalesce(due_notified_at, now())
    WHERE payout_id = NEW.id;
    UPDATE public.vendors SET payout_account_status = 'needs_update', payout_reminder_sent_at = now()
    WHERE id = NEW.vendor_id AND payout_account_status <> 'disabled';
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_failed', 'Bank declined your payout',
      format('Your bank declined the transfer of %s (%s). The money is safe in your payout queue - update your bank details and we''ll send it in the next payout run.',
             public.inr(NEW.net_payable), NEW.failure_reason));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'failed', 'payout_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_payout_events_trigger ON public.vendor_payouts;
CREATE TRIGGER vendor_payout_events_trigger
  AFTER INSERT OR UPDATE OF status ON public.vendor_payouts
  FOR EACH ROW EXECUTE FUNCTION public.vendor_payout_events();

-- Bank details changed: back to "submitted" (a declined account becomes
-- payable again), confirm to the boutique - also a security alert if it
-- wasn't them - and tell admins, who make the transfers.
CREATE OR REPLACE FUNCTION public.vendor_payout_account_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last4 text := right(regexp_replace(NEW.bank_account_number, '\s', '', 'g'), 4);
  v_name text;
  v_admin uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.bank_account_number IS NOT DISTINCT FROM OLD.bank_account_number
     AND NEW.bank_ifsc IS NOT DISTINCT FROM OLD.bank_ifsc
     AND NEW.account_holder_name IS NOT DISTINCT FROM OLD.account_holder_name THEN
    RETURN NEW;
  END IF;

  UPDATE public.vendors SET payout_account_status = 'pending'
  WHERE id = NEW.vendor_id AND payout_account_status <> 'disabled'
  RETURNING name INTO v_name;

  PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_account_updated', 'Payout bank details updated',
    format('Payouts will now go to %s, account ending %s (IFSC %s). If you didn''t make this change, contact AllBoutiqs immediately.',
           NEW.account_holder_name, v_last4, NEW.bank_ifsc));

  FOR v_admin IN SELECT * FROM public.admin_user_ids() LOOP
    INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
    VALUES (v_admin, 'other', 'payout_account_updated', 'Boutique bank details changed',
            format('%s %s payout bank details (account ending %s).',
                   coalesce(v_name, 'A boutique'), CASE WHEN TG_OP = 'INSERT' THEN 'added' ELSE 'changed' END, v_last4),
            '/admin');
  END LOOP;

  PERFORM public.invoke_edge_function('send-vendor-payout-email',
    jsonb_build_object('event', 'account_updated', 'vendor_id', NEW.vendor_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_payout_account_changed_trigger ON public.vendor_payout_accounts;
CREATE TRIGGER vendor_payout_account_changed_trigger
  AFTER INSERT OR UPDATE ON public.vendor_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.vendor_payout_account_changed();

-- Orders payable on the delivery day were already announced as such, so
-- they don't get a separate "now in queue" alert.
CREATE OR REPLACE FUNCTION public.stamp_vendor_order_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := coalesce(NEW.delivered_at, now());
    NEW.payout_eligible_on := public.vendor_order_payout_date(NEW.id, NEW.delivered_at);
    IF NEW.payout_eligible_on <= (NEW.delivered_at AT TIME ZONE 'Asia/Kolkata')::date THEN
      NEW.due_notified_at := coalesce(NEW.due_notified_at, now());
    END IF;
    IF OLD.payout_notified_at IS NULL THEN
      NEW.payout_notified_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Daily (09:00 IST): orders whose payout date arrived move to the queue -
-- one alert per boutique - and boutiques whose queued money can't be paid
-- (no bank details / declined account) are reminded every 7 days.
CREATE OR REPLACE FUNCTION public.process_vendor_payout_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  r record;
  v_status text;
  v_has_account boolean;
BEGIN
  FOR r IN
    SELECT vendor_id, array_agg(id) AS ids, sum(net_payable) AS total, count(*) AS n
    FROM public.vendor_orders
    WHERE status = 'delivered' AND payout_id IS NULL AND due_notified_at IS NULL
      AND payout_eligible_on IS NOT NULL AND payout_eligible_on <= v_today
    GROUP BY vendor_id
  LOOP
    SELECT payout_account_status INTO v_status FROM public.vendors WHERE id = r.vendor_id;
    v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = r.vendor_id);

    IF v_has_account AND v_status IN ('pending', 'active') THEN
      PERFORM public.notify_vendor_members(r.vendor_id, 'payout_queued', 'Payout ready - in queue',
        format('%s from %s order(s) finished its return window and is now in the queue for your next bank transfer.',
               public.inr(r.total), r.n));
    ELSE
      PERFORM public.notify_vendor_members(r.vendor_id, 'payout_account_missing', 'Payout ready - bank details needed',
        format('%s from %s order(s) is ready to pay, but %s. Update your payout details so we can send it.',
               public.inr(r.total), r.n,
               CASE WHEN v_status = 'needs_update' THEN 'your bank declined the last transfer'
                    ELSE 'your payout account is not set up' END));
      UPDATE public.vendors SET payout_reminder_sent_at = now() WHERE id = r.vendor_id;
    END IF;

    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'queued', 'vendor_id', r.vendor_id, 'vendor_order_ids', to_jsonb(r.ids)));
    UPDATE public.vendor_orders SET due_notified_at = now() WHERE id = ANY (r.ids);
  END LOOP;

  FOR r IN
    SELECT vo.vendor_id, sum(vo.net_payable) AS total, count(*) AS n
    FROM public.vendor_orders vo
    JOIN public.vendors v ON v.id = vo.vendor_id
    WHERE vo.status = 'delivered' AND vo.payout_id IS NULL
      AND vo.payout_eligible_on IS NOT NULL AND vo.payout_eligible_on <= v_today
      AND (v.payout_account_status IN ('not_setup', 'needs_update')
           OR NOT EXISTS (SELECT 1 FROM public.vendor_payout_accounts a WHERE a.vendor_id = v.id))
      AND (v.payout_reminder_sent_at IS NULL OR v.payout_reminder_sent_at < now() - interval '7 days')
    GROUP BY vo.vendor_id
  LOOP
    PERFORM public.notify_vendor_members(r.vendor_id, 'payout_account_missing', 'Reminder: money waiting for you',
      format('%s from %s order(s) is waiting to be paid. Add or fix your payout bank details so we can transfer it.',
             public.inr(r.total), r.n));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'account_reminder', 'vendor_id', r.vendor_id));
    UPDATE public.vendors SET payout_reminder_sent_at = now() WHERE id = r.vendor_id;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.process_vendor_payout_queue() FROM public, anon, authenticated;

SELECT cron.schedule(
  'process-vendor-payout-queue',
  '30 3 * * *',
  $$SELECT public.process_vendor_payout_queue();$$
);

-- ===== [058/100] 20261006110100_invoke_edge_function_timeout.sql =====
-- pg_net's default 5s timeout was too short for the payout emails (load
-- order details + SMTP send): a live "queued" email call timed out at
-- 5000ms with no response recorded. Give edge-function calls 30s.
CREATE OR REPLACE FUNCTION public.invoke_edge_function(_name text, _body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'invoke_edge_function: Vault secrets project_url/service_role_key missing, % not called', _name;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || _name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := _body,
    timeout_milliseconds := 30000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_edge_function(text, jsonb) FROM public, anon, authenticated;

-- ===== [059/100] 20261007100000_razorpay_route_payouts.sql =====
-- Automatic boutique payouts through Razorpay Route.
--   * Each boutique is a Razorpay linked account (created from its bank
--     details + PAN; Razorpay verifies the bank account).
--   * Online orders: when the payment is captured, the boutique's share
--     (net_payable, after commission) is transferred to its linked account
--     ON HOLD. After delivery + return window it's released, and Razorpay
--     settles it to the boutique's bank (settlement UTR via webhook).
--   * COD orders: on the payout date a direct transfer is made from the
--     platform's Razorpay balance.
--   * Refunds before release reverse the boutique's share first.
-- The manual admin payout runs (vendor_payouts) stay only as a fallback.

ALTER TABLE public.vendor_payout_accounts
  ADD COLUMN IF NOT EXISTS pan text,
  ADD COLUMN IF NOT EXISTS legal_business_name text,
  ADD COLUMN IF NOT EXISTS razorpay_status text NOT NULL DEFAULT 'not_created'
    CHECK (razorpay_status IN ('not_created', 'created', 'under_review', 'needs_clarification', 'activated', 'failed')),
  ADD COLUMN IF NOT EXISTS razorpay_product_id text,
  ADD COLUMN IF NOT EXISTS razorpay_requirements jsonb,
  ADD COLUMN IF NOT EXISTS razorpay_error text,
  ADD COLUMN IF NOT EXISTS razorpay_synced_at timestamptz;

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS rzp_transfer_id text,
  ADD COLUMN IF NOT EXISTS rzp_transfer_kind text CHECK (rzp_transfer_kind IN ('payment', 'direct')),
  ADD COLUMN IF NOT EXISTS rzp_transfer_status text
    CHECK (rzp_transfer_status IN ('held', 'released', 'failed', 'reversed')),
  ADD COLUMN IF NOT EXISTS rzp_transfer_amount numeric,
  ADD COLUMN IF NOT EXISTS rzp_reversed_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rzp_transfer_error text,
  ADD COLUMN IF NOT EXISTS rzp_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS rzp_settlement_id text,
  ADD COLUMN IF NOT EXISTS rzp_settlement_utr text,
  ADD COLUMN IF NOT EXISTS rzp_settled_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_orders_rzp_transfer_id
  ON public.vendor_orders(rzp_transfer_id) WHERE rzp_transfer_id IS NOT NULL;

-- Boutiques edit their own bank details, but the Razorpay linkage and
-- verification state only ever come from our server (onboarding function /
-- webhooks) - otherwise a boutique could point its payouts at another
-- linked account or mark itself verified.
CREATE OR REPLACE FUNCTION public.protect_payout_account_razorpay_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.razorpay_account_id := NULL;
    NEW.razorpay_status := 'not_created';
    NEW.razorpay_product_id := NULL;
    NEW.razorpay_requirements := NULL;
    NEW.razorpay_error := NULL;
    NEW.razorpay_synced_at := NULL;
  ELSE
    NEW.razorpay_account_id := OLD.razorpay_account_id;
    NEW.razorpay_status := OLD.razorpay_status;
    NEW.razorpay_product_id := OLD.razorpay_product_id;
    NEW.razorpay_requirements := OLD.razorpay_requirements;
    NEW.razorpay_error := OLD.razorpay_error;
    NEW.razorpay_synced_at := OLD.razorpay_synced_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_payout_account_razorpay_fields_trigger ON public.vendor_payout_accounts;
CREATE TRIGGER protect_payout_account_razorpay_fields_trigger
  BEFORE INSERT OR UPDATE ON public.vendor_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_payout_account_razorpay_fields();

-- Same for money fields on vendor orders: boutiques may update their order
-- status, never the payout date or transfer state.
CREATE OR REPLACE FUNCTION public.protect_vendor_order_payout_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  -- Delivery now releases real money automatically, so order status may
  -- only change through the courier webhook / server functions / admins -
  -- never directly from a boutique's session (no app screen does this).
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Order status is updated by the courier and AllBoutiqs, not directly';
  END IF;
  -- stamp_vendor_order_delivery (runs after this) recomputes the payout
  -- date from a server-side delivered_at, so a boutique can't backdate it.
  NEW.payout_id := OLD.payout_id;
  NEW.payout_eligible_on := OLD.payout_eligible_on;
  NEW.delivered_at := OLD.delivered_at;
  NEW.due_notified_at := OLD.due_notified_at;
  NEW.payout_notified_at := OLD.payout_notified_at;
  NEW.rzp_transfer_id := OLD.rzp_transfer_id;
  NEW.rzp_transfer_kind := OLD.rzp_transfer_kind;
  NEW.rzp_transfer_status := OLD.rzp_transfer_status;
  NEW.rzp_transfer_amount := OLD.rzp_transfer_amount;
  NEW.rzp_reversed_amount := OLD.rzp_reversed_amount;
  NEW.rzp_transfer_error := OLD.rzp_transfer_error;
  NEW.rzp_released_at := OLD.rzp_released_at;
  NEW.rzp_settlement_id := OLD.rzp_settlement_id;
  NEW.rzp_settlement_utr := OLD.rzp_settlement_utr;
  NEW.rzp_settled_at := OLD.rzp_settled_at;
  RETURN NEW;
END;
$$;

-- Runs before stamp_vendor_order_delivery (alphabetical order of BEFORE
-- triggers), so a status change still gets its payout date computed.
DROP TRIGGER IF EXISTS a_protect_vendor_order_payout_fields_trigger ON public.vendor_orders;
CREATE TRIGGER a_protect_vendor_order_payout_fields_trigger
  BEFORE UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_vendor_order_payout_fields();

-- Daily 10:00 IST: release payouts whose date has arrived (after the 09:00
-- queue/notification job) through the razorpay-route-release function.
SELECT cron.schedule(
  'razorpay-route-release',
  '30 4 * * *',
  $$SELECT public.invoke_edge_function('razorpay-route-release', '{}'::jsonb);$$
);

-- ===== [060/100] 20261010100000_notification_deep_links.sql =====
-- Notifications open the exact page, tab and item they're about (for
-- admins, boutiques and customers): link_url carries ?tab= and ?focus=
-- (+ &sub= for nested admin tabs), which the frontend uses to switch tab and
-- open/highlight that order, return or payout. Mirrors
-- supabase/functions/_shared/notify.ts `links`. Also adds the order number
-- to messages, and customer notifications for their own orders.

CREATE OR REPLACE FUNCTION public.nlink(_path text, _tab text, _focus uuid DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _path || '?tab=' || _tab || coalesce('&focus=' || _focus::text, '');
$$;

CREATE OR REPLACE FUNCTION public.order_ref(_order_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '#' || left(_order_id::text, 8);
$$;

-- Payouts tab, scrolled to the payout bank details form.
CREATE OR REPLACE FUNCTION public.vendor_payout_account_link()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '/vendor?tab=payouts&focus=account';
$$;

-- Boutique bell with an explicit link (the 4-arg version keeps the Payouts
-- tab link used by payout alerts).
CREATE OR REPLACE FUNCTION public.notify_vendor_members(_vendor_id uuid, _type text, _title text, _body text, _link text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
  SELECT user_id, 'order', _type, _title, _body, _link
  FROM public.vendor_members WHERE vendor_id = _vendor_id;
$$;
REVOKE ALL ON FUNCTION public.notify_vendor_members(uuid, text, text, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_admins(_category text, _type text, _title text, _body text, _link text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
  SELECT a, _category, _type, _title, _body, _link FROM public.admin_user_ids() AS a;
$$;
REVOKE ALL ON FUNCTION public.notify_admins(text, text, text, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_customer(_order_id uuid, _type text, _title text, _body text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
  SELECT user_id, 'order', _type, _title, _body, '/orders?focus=' || _order_id::text
  FROM public.orders WHERE id = _order_id AND user_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.notify_customer(uuid, text, text, text) FROM public, anon, authenticated;

-- ---------- boutique / admin order alerts ----------

CREATE OR REPLACE FUNCTION public.notify_new_vendor_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_name text;
BEGIN
  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = NEW.vendor_id;
  PERFORM public.notify_vendor_members(NEW.vendor_id, 'new_order', 'New order received',
    format('Order %s (%s) is waiting to be confirmed.', public.order_ref(NEW.order_id), public.inr(NEW.net_payable)),
    public.nlink('/vendor', 'orders', NEW.id));
  PERFORM public.notify_admins('order', 'new_order', 'New order placed',
    format('Order %s for %s.', public.order_ref(NEW.order_id), coalesce(v_vendor_name, 'a boutique')),
    public.nlink('/admin', 'orders', NEW.id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_order_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_name text;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = NEW.vendor_id;
    PERFORM public.notify_admins('order', 'order_confirmed', 'Boutique confirmed an order',
      format('%s confirmed order %s.', coalesce(v_vendor_name, 'A boutique'), public.order_ref(NEW.order_id)),
      public.nlink('/admin', 'orders', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_order_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id uuid;
  v_vendor_name text;
BEGIN
  SELECT vendor_id INTO v_vendor_id FROM public.vendor_orders WHERE id = NEW.vendor_order_id;
  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_vendor_id;
  IF v_vendor_id IS NOT NULL THEN
    PERFORM public.notify_vendor_members(v_vendor_id, 'order_cancelled', 'An order was cancelled',
      format('Order %s was cancelled: %s', public.order_ref(NEW.order_id), coalesce(NEW.reason, 'no reason given')),
      public.nlink('/vendor', 'orders', NEW.vendor_order_id));
  END IF;
  PERFORM public.notify_admins('order', 'order_cancelled', 'An order was cancelled',
    format('Order %s (%s) - %s', public.order_ref(NEW.order_id), coalesce(v_vendor_name, 'a boutique'), coalesce(NEW.reason, 'no reason given')),
    public.nlink('/admin', 'cancelled', NEW.vendor_order_id));
  RETURN NEW;
END;
$$;

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
  LOOP
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_row.vendor_id;
    PERFORM public.notify_admins('order', 'unconfirmed_reminder', 'Order still unconfirmed after 2 hours',
      format('%s has not confirmed order %s, placed over 2 hours ago.', coalesce(v_vendor_name, 'A boutique'), public.order_ref(v_row.order_id)),
      public.nlink('/admin', 'orders', v_row.id));
    UPDATE public.vendor_orders SET reminder_sent_at = now() WHERE id = v_row.id;
  END LOOP;
END;
$$;

-- ---------- returns ----------

CREATE OR REPLACE FUNCTION public.notify_return_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
  v_sla integer;
BEGIN
  v_label := CASE WHEN NEW.request_type = 'exchange' THEN 'An exchange was requested' ELSE 'A return was requested' END;
  IF NEW.handled_by = 'vendor' THEN
    SELECT return_vendor_sla_hours INTO v_sla FROM public.platform_settings WHERE id;
    PERFORM public.notify_vendor_members(public.return_request_items_sole_vendor(NEW.items), 'return_requested', v_label,
      format('Order %s: %s - please accept or reject within %s hours, or it goes to the AllBoutiqs team.',
             public.order_ref(NEW.order_id), NEW.reason, v_sla),
      public.nlink('/vendor', 'returns', NEW.id));
  ELSE
    PERFORM public.notify_admins('order', 'return_requested', v_label,
      format('Order %s: %s', public.order_ref(NEW.order_id), NEW.reason),
      public.nlink('/admin', 'returns', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.escalate_overdue_return_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sla integer;
  v_row record;
BEGIN
  SELECT return_vendor_sla_hours INTO v_sla FROM public.platform_settings WHERE id;
  FOR v_row IN
    UPDATE public.return_requests
    SET handled_by = 'admin', escalated_at = now()
    WHERE handled_by = 'vendor' AND status = 'pending' AND created_at < now() - make_interval(hours => v_sla)
    RETURNING id, order_id, items, request_type
  LOOP
    PERFORM public.notify_admins('order', 'return_escalated',
      format('%s request for order %s escalated', initcap(v_row.request_type), public.order_ref(v_row.order_id)),
      format('The boutique did not respond within %s hours. It now needs your decision.', v_sla),
      public.nlink('/admin', 'returns', v_row.id));
    PERFORM public.notify_vendor_members(public.return_request_items_sole_vendor(v_row.items), 'return_escalated',
      format('%s request for order %s moved to AllBoutiqs', initcap(v_row.request_type), public.order_ref(v_row.order_id)),
      format('No response within %s hours, so the AllBoutiqs team will decide this request.', v_sla),
      public.nlink('/vendor', 'returns', v_row.id));
  END LOOP;
END;
$$;

-- ---------- payouts (focus the specific order on the Payouts tab) ----------

CREATE OR REPLACE FUNCTION public.notify_vendor_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_account boolean;
  v_hold integer;
  v_date text := to_char(NEW.payout_eligible_on, 'DD Mon YYYY');
BEGIN
  IF NOT (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered'
          AND OLD.payout_notified_at IS NULL AND NEW.payout_notified_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = NEW.vendor_id);
  v_hold := coalesce(public.vendor_order_payout_hold_days(NEW.id), 0);
  IF v_has_account THEN
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_scheduled', 'Order delivered - payout scheduled',
      format('Order %s was delivered. Your payout of %s is scheduled for %s %s.',
        public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date,
        CASE WHEN v_hold > 0 THEN format('(after the %s-day return window)', v_hold)
             ELSE '(non-returnable, so no return-window wait)' END),
      public.nlink('/vendor', 'payouts', NEW.id));
  ELSE
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_account_missing', 'Order delivered - add your payout account',
      format('Order %s was delivered and %s is due to you on %s, but your payout account is not set up yet. Add your bank details so we can pay you.',
        public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date),
      public.vendor_payout_account_link());
  END IF;
  PERFORM public.invoke_edge_function('send-vendor-payout-email', jsonb_build_object('vendor_order_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_payout_account_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last4 text := right(regexp_replace(NEW.bank_account_number, '\s', '', 'g'), 4);
  v_name text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.bank_account_number IS NOT DISTINCT FROM OLD.bank_account_number
     AND NEW.bank_ifsc IS NOT DISTINCT FROM OLD.bank_ifsc
     AND NEW.account_holder_name IS NOT DISTINCT FROM OLD.account_holder_name THEN
    RETURN NEW;
  END IF;

  UPDATE public.vendors SET payout_account_status = 'pending'
  WHERE id = NEW.vendor_id AND payout_account_status <> 'disabled'
  RETURNING name INTO v_name;

  PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_account_updated', 'Payout bank details updated',
    format('Payouts will now go to %s, account ending %s (IFSC %s). If you didn''t make this change, contact AllBoutiqs immediately.',
           NEW.account_holder_name, v_last4, NEW.bank_ifsc),
    public.vendor_payout_account_link());
  PERFORM public.notify_admins('other', 'payout_account_updated', 'Boutique bank details changed',
    format('%s %s payout bank details (account ending %s).',
           coalesce(v_name, 'A boutique'), CASE WHEN TG_OP = 'INSERT' THEN 'added' ELSE 'changed' END, v_last4),
    public.nlink('/admin', 'vendor-payouts'));
  PERFORM public.invoke_edge_function('send-vendor-payout-email',
    jsonb_build_object('event', 'account_updated', 'vendor_id', NEW.vendor_id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_vendor_payout_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  r record;
  v_status text;
  v_has_account boolean;
BEGIN
  FOR r IN
    SELECT vendor_id, array_agg(id) AS ids, sum(net_payable) AS total, count(*) AS n
    FROM public.vendor_orders
    WHERE status = 'delivered' AND payout_id IS NULL AND due_notified_at IS NULL
      AND payout_eligible_on IS NOT NULL AND payout_eligible_on <= v_today
    GROUP BY vendor_id
  LOOP
    SELECT payout_account_status INTO v_status FROM public.vendors WHERE id = r.vendor_id;
    v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = r.vendor_id);
    IF v_has_account AND v_status IN ('pending', 'active') THEN
      PERFORM public.notify_vendor_members(r.vendor_id, 'payout_queued', 'Payout ready - in queue',
        format('%s from %s order(s) finished its return window and is now in the queue for your next bank transfer.', public.inr(r.total), r.n),
        public.nlink('/vendor', 'payouts', r.ids[1]));
    ELSE
      PERFORM public.notify_vendor_members(r.vendor_id, 'payout_account_missing', 'Payout ready - bank details needed',
        format('%s from %s order(s) is ready to pay, but %s. Update your payout details so we can send it.', public.inr(r.total), r.n,
          CASE WHEN v_status = 'needs_update' THEN 'your bank declined the last transfer' ELSE 'your payout account is not set up' END),
        public.vendor_payout_account_link());
      UPDATE public.vendors SET payout_reminder_sent_at = now() WHERE id = r.vendor_id;
    END IF;
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'queued', 'vendor_id', r.vendor_id, 'vendor_order_ids', to_jsonb(r.ids)));
    UPDATE public.vendor_orders SET due_notified_at = now() WHERE id = ANY (r.ids);
  END LOOP;

  FOR r IN
    SELECT vo.vendor_id, sum(vo.net_payable) AS total, count(*) AS n
    FROM public.vendor_orders vo
    JOIN public.vendors v ON v.id = vo.vendor_id
    WHERE vo.status = 'delivered' AND vo.payout_id IS NULL
      AND vo.payout_eligible_on IS NOT NULL AND vo.payout_eligible_on <= v_today
      AND (v.payout_account_status IN ('not_setup', 'needs_update')
           OR NOT EXISTS (SELECT 1 FROM public.vendor_payout_accounts a WHERE a.vendor_id = v.id))
      AND (v.payout_reminder_sent_at IS NULL OR v.payout_reminder_sent_at < now() - interval '7 days')
    GROUP BY vo.vendor_id
  LOOP
    PERFORM public.notify_vendor_members(r.vendor_id, 'payout_account_missing', 'Reminder: money waiting for you',
      format('%s from %s order(s) is waiting to be paid. Add or fix your payout bank details so we can transfer it.', public.inr(r.total), r.n),
      public.vendor_payout_account_link());
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'account_reminder', 'vendor_id', r.vendor_id));
    UPDATE public.vendors SET payout_reminder_sent_at = now() WHERE id = r.vendor_id;
  END LOOP;
END;
$$;

-- ---------- customer notifications (link: My Orders, that order open) ----------

CREATE OR REPLACE FUNCTION public.notify_customer_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text := upper(public.order_ref(NEW.order_id));
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  CASE NEW.status
    WHEN 'confirmed' THEN
      IF OLD.status = 'pending' THEN
        PERFORM public.notify_customer(NEW.order_id, 'order_confirmed', 'Order confirmed',
          format('Your order %s was confirmed and is being prepared.', v_ref));
      END IF;
    WHEN 'shipped' THEN
      IF OLD.status IN ('pending', 'confirmed', 'processing') THEN
        PERFORM public.notify_customer(NEW.order_id, 'order_shipped', 'Order shipped',
          format('Your order %s is on its way.', v_ref));
      END IF;
    WHEN 'out_for_delivery' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_out_for_delivery', 'Out for delivery',
        format('Your order %s is out for delivery today.', v_ref));
    WHEN 'delivered' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_delivered', 'Order delivered',
        format('Your order %s was delivered. If something isn''t right, you can request a return or exchange from My Orders.', v_ref));
    WHEN 'cancelled' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_cancelled', 'Order cancelled',
        format('Your order %s was cancelled. Any online payment is refunded to your original payment method.', v_ref));
    WHEN 'ndr' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_delivery_failed', 'Delivery attempt failed',
        format('The courier couldn''t deliver your order %s. They will try again - please keep your phone reachable.', v_ref));
    WHEN 'returned' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_returned', 'Order returned to the boutique',
        format('Your order %s could not be delivered and went back to the boutique.', v_ref));
    ELSE
      NULL;
  END CASE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_customer_order_status_trigger ON public.vendor_orders;
CREATE TRIGGER notify_customer_order_status_trigger
  AFTER UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_order_status();

CREATE OR REPLACE FUNCTION public.notify_customer_return_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := CASE WHEN NEW.request_type = 'exchange' THEN 'exchange' ELSE 'return' END;
  v_ref text := upper(public.order_ref(NEW.order_id));
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  CASE NEW.status
    WHEN 'approved' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_approved', format('Your %s was approved', v_kind),
        format('Your %s request for order %s was approved. A courier will pick the items up.', v_kind, v_ref));
    WHEN 'rejected' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_rejected', format('Your %s request was declined', v_kind),
        format('Your %s request for order %s was declined%s.', v_kind, v_ref,
               coalesce(': ' || nullif(coalesce(NEW.vendor_notes, NEW.admin_notes), ''), '')));
    WHEN 'pickup_scheduled' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_pickup_scheduled', 'Pickup scheduled',
        format('A courier pickup is scheduled for your %s on order %s. Please keep the items packed and ready.', v_kind, v_ref));
    WHEN 'picked_up' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_picked_up', 'Items picked up',
        format('The courier picked up your %s for order %s.', v_kind, v_ref));
    WHEN 'completed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_completed', format('Your %s is complete', v_kind),
        format('Your %s for order %s is complete.%s', v_kind, v_ref,
               CASE WHEN v_kind = 'return' THEN ' Your refund is on its way.' ELSE ' Your replacement is on its way.' END));
    WHEN 'pickup_failed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_pickup_failed', 'Pickup couldn''t be completed',
        format('The courier couldn''t pick up your %s for order %s. Our team will reschedule it.', v_kind, v_ref));
    ELSE
      NULL;
  END CASE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_customer_return_status_trigger ON public.return_requests;
CREATE TRIGGER notify_customer_return_status_trigger
  AFTER UPDATE OF status ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_return_status();

CREATE OR REPLACE FUNCTION public.notify_customer_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'processed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'processed') THEN
    PERFORM public.notify_customer(NEW.order_id, 'refund_processed', 'Refund processed',
      format('%s for order %s was refunded to your original payment method. Banks usually show it within 5-7 working days.',
             public.inr(NEW.amount), upper(public.order_ref(NEW.order_id))));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_customer_refund_trigger ON public.refunds;
CREATE TRIGGER notify_customer_refund_trigger
  AFTER INSERT OR UPDATE OF status ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_refund();

-- ===== [061/100] 20261010110000_email_otp_login.sql =====
-- Passwordless sign-in / sign-up: a 6-digit code is emailed (our own SMTP,
-- see supabase/functions/auth-email-otp) and exchanged for a normal
-- Supabase session. Only a keyed hash of each code is stored. Everything
-- here is service-role only - clients never read or write these rows.

CREATE TABLE IF NOT EXISTS public.auth_email_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  ip text,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_email_otps_email_created ON public.auth_email_otps (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_email_otps_ip_created ON public.auth_email_otps (ip, created_at DESC);

ALTER TABLE public.auth_email_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_email_otps FROM anon, authenticated;

-- Counts a guess before it's checked, so parallel requests can't get more
-- than the allowed number of tries. Returns the attempt number, or NULL
-- when the code is used up, already consumed or expired.
CREATE OR REPLACE FUNCTION public.claim_email_otp_attempt(_id uuid, _max_attempts integer)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.auth_email_otps
  SET attempts = attempts + 1
  WHERE id = _id AND consumed_at IS NULL AND expires_at > now() AND attempts < _max_attempts
  RETURNING attempts;
$$;
REVOKE ALL ON FUNCTION public.claim_email_otp_attempt(uuid, integer) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM public, anon, authenticated;

SELECT cron.schedule(
  'purge-auth-email-otps',
  '15 2 * * *',
  $$DELETE FROM public.auth_email_otps WHERE created_at < now() - interval '1 day';$$
);

-- ===== [062/100] 20261010120000_product_cod_available.sql =====
-- Cash on Delivery per product: the boutique sets it when listing, admins
-- can change it on any product. A checkout can use COD only if every
-- product in it allows COD and every boutique has COD switched on
-- (vendors.cod_enabled). Checkout hides the option; this enforces it for
-- the order lines a customer writes, so it can't be bypassed.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cod_available boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.enforce_cod_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method text;
  v_cod_available boolean;
  v_vendor_cod boolean;
  v_vendor_name text;
BEGIN
  -- Server-side writers (service role, admins) are trusted.
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  SELECT payment_method INTO v_method FROM public.orders WHERE id = NEW.order_id;
  IF v_method IS DISTINCT FROM 'cod' THEN
    RETURN NEW;
  END IF;

  SELECT p.cod_available, v.cod_enabled, v.name
  INTO v_cod_available, v_vendor_cod, v_vendor_name
  FROM public.products p
  LEFT JOIN public.vendors v ON v.id = p.vendor_id
  WHERE p.id = NEW.product_id;

  IF v_cod_available IS FALSE THEN
    RAISE EXCEPTION 'Cash on Delivery isn''t available for "%". Please pay online.', NEW.product_title
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_vendor_cod IS FALSE THEN
    RAISE EXCEPTION '% doesn''t offer Cash on Delivery. Please pay online.', coalesce(v_vendor_name, 'This boutique')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_cod_availability_trigger ON public.order_items;
CREATE TRIGGER enforce_cod_availability_trigger
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cod_availability();

-- ===== [063/100] 20261010120100_fix_cod_guard_product_id_type.sql =====
-- order_items.product_id is text (it predates products.id being the only
-- source), so the COD guard's lookup compared uuid = text and failed every
-- COD order line. Compare as text.
CREATE OR REPLACE FUNCTION public.enforce_cod_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method text;
  v_cod_available boolean;
  v_vendor_cod boolean;
  v_vendor_name text;
BEGIN
  -- Server-side writers (service role, admins) are trusted.
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  SELECT payment_method INTO v_method FROM public.orders WHERE id = NEW.order_id;
  IF v_method IS DISTINCT FROM 'cod' THEN
    RETURN NEW;
  END IF;

  SELECT p.cod_available, v.cod_enabled, v.name
  INTO v_cod_available, v_vendor_cod, v_vendor_name
  FROM public.products p
  LEFT JOIN public.vendors v ON v.id = p.vendor_id
  WHERE p.id::text = NEW.product_id::text;

  IF v_cod_available IS FALSE THEN
    RAISE EXCEPTION 'Cash on Delivery isn''t available for "%". Please pay online.', NEW.product_title
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_vendor_cod IS FALSE THEN
    RAISE EXCEPTION '% doesn''t offer Cash on Delivery. Please pay online.', coalesce(v_vendor_name, 'This boutique')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ===== [064/100] 20261010130000_vendor_registration_kyc.sql =====
-- Seller registration: business constitution, the documents each
-- constitution requires (PDF only), bank details with proof, authorized /
-- contact person and contact numbers.
--
-- Kept out of `vendors` on purpose: approved vendors' rows are readable by
-- anyone (storefront), these are not - only the boutique's own members and
-- admins can read them. The whole application is submitted through one
-- function that validates it and creates the vendor, its owner membership,
-- KYC record, documents and payout account together.

-- ---------- KYC record (one per vendor) ----------

CREATE TABLE IF NOT EXISTS public.vendor_kyc (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  business_constitution text NOT NULL
    CHECK (business_constitution IN ('proprietorship', 'partnership', 'llp', 'private_limited')),
  legal_business_name text NOT NULL,
  pan text NOT NULL CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  gstin text CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  primary_mobile text NOT NULL,
  alternate_mobile text NOT NULL,
  business_email text NOT NULL,
  authorized_name text NOT NULL,
  authorized_designation text NOT NULL,
  authorized_mobile text NOT NULL,
  authorized_email text NOT NULL,
  contact_same_as_authorized boolean NOT NULL DEFAULT true,
  contact_name text,
  contact_designation text,
  contact_mobile text,
  contact_email text,
  bank_proof_type text NOT NULL CHECK (bank_proof_type IN ('cancelled_cheque', 'bank_letter', 'bank_statement')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_kyc ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendor members and admins read KYC"
  ON public.vendor_kyc FOR SELECT TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

-- ---------- documents ----------

CREATE TABLE IF NOT EXISTS public.vendor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN (
    'pan_card', 'aadhaar_card', 'gst_certificate', 'msme_certificate', 'partnership_deed',
    'rof_certificate', 'llp_incorporation', 'company_incorporation', 'bank_proof')),
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, doc_type)
);

ALTER TABLE public.vendor_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendor members and admins read documents"
  ON public.vendor_documents FOR SELECT TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.vendor_payout_accounts ADD COLUMN IF NOT EXISTS bank_name text;

-- Private bucket, PDFs only, 10 MB each. Applicants upload into a folder
-- named after their own user id; files can't be changed or deleted by
-- clients once uploaded.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('vendor-documents', 'vendor-documents', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['application/pdf'];

CREATE POLICY "Applicants upload their own seller documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Seller documents readable by uploader, boutique members and admins"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vendor-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.vendor_documents d
        WHERE d.file_path = storage.objects.name AND public.is_vendor_member(auth.uid(), d.vendor_id)
      )
    )
  );

-- ---------- checklist (mirrors src/lib/vendorKyc.ts) ----------

CREATE OR REPLACE FUNCTION public.vendor_required_documents(_constitution text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _constitution
    WHEN 'proprietorship' THEN ARRAY['pan_card', 'aadhaar_card', 'gst_certificate']
    WHEN 'partnership' THEN ARRAY['pan_card', 'gst_certificate', 'partnership_deed', 'rof_certificate', 'aadhaar_card']
    WHEN 'llp' THEN ARRAY['pan_card', 'gst_certificate', 'llp_incorporation', 'aadhaar_card']
    WHEN 'private_limited' THEN ARRAY['pan_card', 'gst_certificate', 'company_incorporation', 'aadhaar_card']
  END || ARRAY['bank_proof'];
$$;

CREATE OR REPLACE FUNCTION public.vendor_optional_documents(_constitution text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN _constitution = 'proprietorship' THEN ARRAY['msme_certificate'] ELSE ARRAY[]::text[] END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_document_label(_doc_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _doc_type
    WHEN 'pan_card' THEN 'PAN card'
    WHEN 'aadhaar_card' THEN 'Aadhaar card'
    WHEN 'gst_certificate' THEN 'GST registration certificate'
    WHEN 'msme_certificate' THEN 'MSME certificate'
    WHEN 'partnership_deed' THEN 'Partnership deed'
    WHEN 'rof_certificate' THEN 'ROF (Register of Firms) certificate'
    WHEN 'llp_incorporation' THEN 'LLP incorporation document'
    WHEN 'company_incorporation' THEN 'Company incorporation document'
    WHEN 'bank_proof' THEN 'Bank proof'
    ELSE _doc_type
  END;
$$;

-- 10-digit Indian mobile (accepts +91 / 0 prefixes and spaces), or NULL.
CREATE OR REPLACE FUNCTION public.normalize_indian_mobile(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN d ~ '^[6-9][0-9]{9}$' THEN d END
  FROM (
    SELECT CASE
      WHEN length(x) = 12 AND x LIKE '91%' THEN substr(x, 3)
      WHEN length(x) = 11 AND x LIKE '0%' THEN substr(x, 2)
      ELSE x
    END AS d
    FROM (SELECT regexp_replace(coalesce(_raw, ''), '[^0-9]', '', 'g') AS x) s
  ) t;
$$;

-- ---------- submit ----------

CREATE OR REPLACE FUNCTION public.submit_vendor_application(_app jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email_re text := '^[^\s@]+@[^\s@]+\.[^\s@]+$';
  v_name text := btrim(coalesce(_app->>'name', ''));
  v_constitution text := _app->>'business_constitution';
  v_legal text := btrim(coalesce(_app->>'legal_business_name', ''));
  v_pan text := upper(btrim(coalesce(_app->>'pan', '')));
  v_gstin text := upper(btrim(coalesce(_app->>'gstin', '')));
  v_primary text := public.normalize_indian_mobile(_app->>'primary_mobile');
  v_alternate text := public.normalize_indian_mobile(_app->>'alternate_mobile');
  v_business_email text := lower(btrim(coalesce(_app->>'business_email', '')));
  v_auth jsonb := coalesce(_app->'authorized_person', '{}'::jsonb);
  v_auth_mobile text := public.normalize_indian_mobile(v_auth->>'mobile');
  v_same boolean := coalesce((_app->>'contact_same_as_authorized')::boolean, true);
  v_contact jsonb := coalesce(_app->'contact_person', '{}'::jsonb);
  v_contact_mobile text := public.normalize_indian_mobile(v_contact->>'mobile');
  v_bank jsonb := coalesce(_app->'bank', '{}'::jsonb);
  v_account text := regexp_replace(coalesce(v_bank->>'account_number', ''), '\s', '', 'g');
  v_ifsc text := upper(btrim(coalesce(v_bank->>'ifsc', '')));
  v_docs jsonb := coalesce(_app->'documents', '[]'::jsonb);
  v_doc jsonb;
  v_types text[] := ARRAY[]::text[];
  v_allowed text[];
  v_missing text[];
  v_base text;
  v_slug text;
  v_try integer := 0;
  v_vendor_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to apply.';
  END IF;
  IF EXISTS (SELECT 1 FROM vendor_members WHERE user_id = v_uid)
     OR EXISTS (SELECT 1 FROM vendors WHERE owner_user_id = v_uid) THEN
    RAISE EXCEPTION 'You already have a store application.';
  END IF;

  IF v_name = '' THEN RAISE EXCEPTION 'Enter your store name.'; END IF;
  IF v_constitution IS NULL OR v_constitution NOT IN ('proprietorship', 'partnership', 'llp', 'private_limited') THEN
    RAISE EXCEPTION 'Select your business constitution.';
  END IF;
  IF v_legal = '' THEN RAISE EXCEPTION 'Enter your legal business name.'; END IF;
  IF v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN RAISE EXCEPTION 'Enter a valid PAN (e.g. ABCDE1234F).'; END IF;
  IF v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RAISE EXCEPTION 'Enter a valid 15-character GST number.';
  END IF;
  IF substr(v_gstin, 3, 10) <> v_pan THEN
    RAISE EXCEPTION 'The GST number doesn''t match the PAN (characters 3 to 12 of a GST number are the PAN).';
  END IF;
  IF v_primary IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit primary mobile number.'; END IF;
  IF v_alternate IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit alternative mobile number.'; END IF;
  IF v_alternate = v_primary THEN
    RAISE EXCEPTION 'The alternative mobile number must be different from the primary one.';
  END IF;
  IF v_business_email !~ v_email_re THEN RAISE EXCEPTION 'Enter a valid official business email address.'; END IF;

  IF btrim(coalesce(v_auth->>'name', '')) = '' THEN RAISE EXCEPTION 'Enter the authorized person''s full name.'; END IF;
  IF btrim(coalesce(v_auth->>'designation', '')) = '' THEN RAISE EXCEPTION 'Enter the authorized person''s designation.'; END IF;
  IF v_auth_mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit mobile number for the authorized person.'; END IF;
  IF lower(btrim(coalesce(v_auth->>'email', ''))) !~ v_email_re THEN
    RAISE EXCEPTION 'Enter a valid email for the authorized person.';
  END IF;
  IF NOT v_same THEN
    IF btrim(coalesce(v_contact->>'name', '')) = '' OR btrim(coalesce(v_contact->>'designation', '')) = '' THEN
      RAISE EXCEPTION 'Enter the contact person''s name and designation.';
    END IF;
    IF v_contact_mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit mobile number for the contact person.'; END IF;
    IF lower(btrim(coalesce(v_contact->>'email', ''))) !~ v_email_re THEN
      RAISE EXCEPTION 'Enter a valid email for the contact person.';
    END IF;
  END IF;

  IF btrim(coalesce(v_bank->>'account_holder_name', '')) = '' THEN RAISE EXCEPTION 'Enter the bank account holder name.'; END IF;
  IF v_account !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Enter a valid bank account number (9 to 18 digits).'; END IF;
  IF v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Enter a valid 11-character IFSC code.'; END IF;
  IF btrim(coalesce(v_bank->>'bank_name', '')) = '' THEN RAISE EXCEPTION 'Enter the bank name.'; END IF;
  IF coalesce(v_bank->>'proof_type', '') NOT IN ('cancelled_cheque', 'bank_letter', 'bank_statement') THEN
    RAISE EXCEPTION 'Choose the type of bank proof you are uploading.';
  END IF;

  -- Documents: only this constitution's types, each a PDF this applicant
  -- uploaded to their own folder.
  v_allowed := public.vendor_required_documents(v_constitution) || public.vendor_optional_documents(v_constitution);
  FOR v_doc IN SELECT * FROM jsonb_array_elements(v_docs) LOOP
    IF NOT (v_doc->>'doc_type' = ANY (v_allowed)) THEN
      RAISE EXCEPTION '% isn''t needed for this business constitution.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    IF v_doc->>'doc_type' = ANY (v_types) THEN
      RAISE EXCEPTION 'Upload only one %.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    IF coalesce(v_doc->>'file_path', '') NOT LIKE v_uid::text || '/%'
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id = 'vendor-documents' AND o.name = v_doc->>'file_path'
           AND o.metadata->>'mimetype' = 'application/pdf'
       ) THEN
      RAISE EXCEPTION 'The % upload wasn''t found - please upload it again as a PDF.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    v_types := v_types || (v_doc->>'doc_type');
  END LOOP;
  SELECT array_agg(public.vendor_document_label(t)) INTO v_missing
  FROM unnest(public.vendor_required_documents(v_constitution)) AS t
  WHERE NOT (t = ANY (v_types));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Please upload: %.', array_to_string(v_missing, ', ');
  END IF;

  -- Unique storefront slug.
  v_base := nullif(trim(BOTH '-' FROM regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), '');
  v_base := coalesce(v_base, 'store-' || substr(md5(random()::text), 1, 6));
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM vendors WHERE slug = v_slug) LOOP
    v_try := v_try + 1;
    v_slug := v_base || '-' || v_try;
  END LOOP;

  INSERT INTO vendors (
    owner_user_id, name, slug, description, contact_email, contact_phone, gst_number, address,
    shipping_flat_rate, free_shipping_threshold, return_window_days, return_policy,
    status, commission_rate, payout_account_status, rating
  ) VALUES (
    v_uid, v_name, v_slug, nullif(btrim(coalesce(_app->>'description', '')), ''), v_business_email, v_primary, v_gstin,
    coalesce(_app->'address', '{}'::jsonb),
    coalesce((_app->>'shipping_flat_rate')::numeric, 0),
    nullif(_app->>'free_shipping_threshold', '')::numeric,
    coalesce((_app->>'return_window_days')::integer, 7),
    nullif(btrim(coalesce(_app->>'return_policy', '')), ''),
    'pending', 10, 'not_setup', 0
  )
  RETURNING id INTO v_vendor_id;

  INSERT INTO vendor_members (user_id, vendor_id, role) VALUES (v_uid, v_vendor_id, 'owner');

  INSERT INTO vendor_kyc (
    vendor_id, business_constitution, legal_business_name, pan, gstin, primary_mobile, alternate_mobile,
    business_email, authorized_name, authorized_designation, authorized_mobile, authorized_email,
    contact_same_as_authorized, contact_name, contact_designation, contact_mobile, contact_email, bank_proof_type
  ) VALUES (
    v_vendor_id, v_constitution, v_legal, v_pan, v_gstin, v_primary, v_alternate,
    v_business_email, btrim(v_auth->>'name'), btrim(v_auth->>'designation'), v_auth_mobile, lower(btrim(v_auth->>'email')),
    v_same,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'name') END,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'designation') END,
    CASE WHEN v_same THEN NULL ELSE v_contact_mobile END,
    CASE WHEN v_same THEN NULL ELSE lower(btrim(v_contact->>'email')) END,
    v_bank->>'proof_type'
  );

  INSERT INTO vendor_documents (vendor_id, doc_type, file_path, file_name, file_size, uploaded_by)
  SELECT v_vendor_id, d->>'doc_type', d->>'file_path', coalesce(nullif(d->>'file_name', ''), 'document.pdf'),
         nullif(d->>'file_size', '')::integer, v_uid
  FROM jsonb_array_elements(v_docs) AS d;

  -- Same table the Payouts tab and Razorpay onboarding use.
  INSERT INTO vendor_payout_accounts (
    vendor_id, account_holder_name, bank_account_number, bank_ifsc, bank_name, business_type, pan, legal_business_name
  ) VALUES (
    v_vendor_id, btrim(v_bank->>'account_holder_name'), v_account, v_ifsc, btrim(v_bank->>'bank_name'),
    v_constitution, v_pan, v_legal
  );

  PERFORM public.notify_admins('other', 'vendor_application', 'New boutique application',
    format('%s (%s) applied to sell on AllBoutiqs.', v_name, replace(initcap(replace(v_constitution, '_', ' ')), 'Llp', 'LLP')),
    '/admin?tab=vendors&sub=applications');

  RETURN v_vendor_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_vendor_application(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application(jsonb) TO authenticated;

-- Bank details arriving with an application aren't a "your payout account
-- changed" event - stay quiet until the boutique is approved.
CREATE OR REPLACE FUNCTION public.vendor_payout_account_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last4 text := right(regexp_replace(NEW.bank_account_number, '\s', '', 'g'), 4);
  v_name text;
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.bank_account_number IS NOT DISTINCT FROM OLD.bank_account_number
     AND NEW.bank_ifsc IS NOT DISTINCT FROM OLD.bank_ifsc
     AND NEW.account_holder_name IS NOT DISTINCT FROM OLD.account_holder_name THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.vendors WHERE id = NEW.vendor_id;

  UPDATE public.vendors SET payout_account_status = 'pending'
  WHERE id = NEW.vendor_id AND payout_account_status <> 'disabled'
  RETURNING name INTO v_name;

  IF v_status = 'pending' THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_account_updated', 'Payout bank details updated',
    format('Payouts will now go to %s, account ending %s (IFSC %s). If you didn''t make this change, contact AllBoutiqs immediately.',
           NEW.account_holder_name, v_last4, NEW.bank_ifsc),
    public.vendor_payout_account_link());
  PERFORM public.notify_admins('other', 'payout_account_updated', 'Boutique bank details changed',
    format('%s %s payout bank details (account ending %s).',
           coalesce(v_name, 'A boutique'), CASE WHEN TG_OP = 'INSERT' THEN 'added' ELSE 'changed' END, v_last4),
    public.nlink('/admin', 'vendor-payouts'));
  PERFORM public.invoke_edge_function('send-vendor-payout-email',
    jsonb_build_object('event', 'account_updated', 'vendor_id', NEW.vendor_id));
  RETURN NEW;
END;
$$;

-- ---------- close direct paths around the checks ----------

-- Applications now go through submit_vendor_application (admins keep their
-- own "manage all vendors" policy, e.g. CSV import).
DROP POLICY IF EXISTS "Users can apply to become a vendor" ON public.vendors;

-- Previously any signed-in user could add themselves to ANY boutique
-- (user_id = auth.uid() was enough) and then read its orders, payouts and
-- bank details. Owners are now added by submit_vendor_application; only
-- admins or existing members of that boutique can add members.
DROP POLICY IF EXISTS "Users can create their own membership" ON public.vendor_members;
CREATE POLICY "Admins and existing members add members"
  ON public.vendor_members FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_vendor_member(auth.uid(), vendor_id));

-- ===== [065/100] 20261010140000_customer_order_status_emails.sql =====
-- Customers only ever got the "order placed" email; every later step
-- reached them only as a bell notification. Each delivery step now also
-- emails them (send-order-email), per boutique shipment: confirmed,
-- shipped, out for delivery, delivery attempt failed, delivered.
-- Cancellations are already emailed by the cancellation flow itself.

-- Public images used inside emails (the AllBoutiqs logo).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('email-assets', 'email-assets', true, 1048576, ARRAY['image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notify_customer_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text := upper(public.order_ref(NEW.order_id));
  v_email text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
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

-- ===== [066/100] 20261011090000_warehouse_staff_role.sql =====
-- Warehouse staff: people who receive, inspect, pack and dispatch parcels at
-- the AllBoutiqs warehouse. Their own role, not admin - they see only the
-- warehouse screens. Kept in its own migration: a new enum value can't be
-- used in the same transaction that adds it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'warehouse_staff';

-- ===== [067/100] 20261011100000_warehouse_logistics.sql =====
-- Warehouse logistics (requirement #19).
--
-- Forward: boutique -> AllBoutiqs warehouse -> customer. The warehouse waits
-- for every boutique's parcel of an order, inspects and repacks, and sends ONE
-- parcel to the customer. Returns go to the warehouse by default (admin can
-- send one straight to the boutique); the warehouse inspects, then refunds and
-- forwards the item to the boutique, or sends it back to the customer.
--
-- Orders placed before this (and any placed while routing is switched off)
-- keep fulfilment_route = 'direct' and run exactly as before.
--
-- Agreed rules (2026-10-11):
--   * delivery estimate = slowest boutique (preparation + courier to warehouse)
--     + 1 working day at the warehouse + courier to the customer; Sundays and
--     warehouse holidays don't count, parcels received after 17:00 count from
--     the next day;
--   * the warehouse waits up to 3 days past a parcel's expected arrival, then
--     admin sends what has arrived or cancels the missing item;
--   * an item failing inspection goes back to the boutique and is cancelled and
--     refunded by default (admin may ask for a replacement instead);
--   * a return's refund is issued when it passes inspection at the warehouse;
--   * AllBoutiqs pays every courier leg for now - each leg's cost is recorded.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS warehouse_routing_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_prep_days integer NOT NULL DEFAULT 2
    CHECK (default_prep_days BETWEEN 0 AND 60),
  ADD COLUMN IF NOT EXISTS warehouse_handling_days integer NOT NULL DEFAULT 1
    CHECK (warehouse_handling_days BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS warehouse_cutoff_hour integer NOT NULL DEFAULT 17
    CHECK (warehouse_cutoff_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS warehouse_max_wait_days integer NOT NULL DEFAULT 3
    CHECK (warehouse_max_wait_days BETWEEN 1 AND 30),
  -- Courier days from a boutique to the warehouse, used for a parcel's
  -- expected arrival until the boutique books it and the courier gives a date.
  ADD COLUMN IF NOT EXISTS warehouse_inbound_transit_days integer NOT NULL DEFAULT 3
    CHECK (warehouse_inbound_transit_days BETWEEN 1 AND 15);

-- ---------------------------------------------------------------------------
-- 2. Warehouses, holidays, roles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  contact_email text NOT NULL,
  -- Same shape as vendors.address / orders.shipping_address.
  address jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  shiprocket_pickup_location text,
  shiprocket_pickup_id integer,
  shiprocket_pickup_registered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_single_default ON public.warehouses (is_default) WHERE is_default;

CREATE TRIGGER update_warehouses_updated_at
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Shiprocket can't edit a pickup address, only add one - a changed address or
-- phone must be registered again (ensurePickupLocation does it on next use).
CREATE OR REPLACE FUNCTION public.reset_warehouse_pickup_registration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.address IS DISTINCT FROM OLD.address
     OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
     OR NEW.contact_name IS DISTINCT FROM OLD.contact_name THEN
    NEW.shiprocket_pickup_location := NULL;
    NEW.shiprocket_pickup_id := NULL;
    NEW.shiprocket_pickup_registered_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reset_warehouse_pickup_registration_trigger
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.reset_warehouse_pickup_registration();

INSERT INTO public.warehouses (code, name, contact_name, contact_phone, contact_email, address, is_default)
VALUES (
  'DEESA',
  'AllBoutiqs Warehouse - Deesa',
  'Hasmukh Soni',
  '9724489316',
  'founder@allboutiqs.com',
  jsonb_build_object(
    'address_line1', '19, Puniynagari',
    'address_line2', 'Near Smrudhipark, Banaskantha',
    'city', 'Deesa',
    'state', 'Gujarat',
    'pincode', '385535',
    'country', 'India'
  ),
  true
)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.warehouse_holidays (
  holiday_date date PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Admins and warehouse staff. Compared as text so this works in the same
-- deploy that adds the 'warehouse_staff' enum value.
CREATE OR REPLACE FUNCTION public.can_operate_warehouse(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin', 'warehouse_staff')
  );
$$;

-- For guard triggers (which must be SECURITY INVOKER so current_user is the
-- real caller): a write made by the server - an edge function (service_role),
-- a cron job, or a SECURITY DEFINER function such as the warehouse RPCs below
-- (current_user is then the function owner) - or by an admin / warehouse
-- staff member. auth.role() alone can't tell these apart: a trigger fired from
-- inside a customer's request still sees the customer's JWT.
CREATE OR REPLACE FUNCTION public.is_server_or_warehouse()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_user::text NOT IN ('anon', 'authenticated')
      OR public.can_operate_warehouse(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.admin_user_ids_and_warehouse()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('admin', 'warehouse_staff');
$$;
REVOKE ALL ON FUNCTION public.admin_user_ids_and_warehouse() FROM public, anon, authenticated;

-- Bell notification for everyone who works the warehouse (admins included).
CREATE OR REPLACE FUNCTION public.notify_warehouse(_type text, _title text, _body text, _link text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
  SELECT u, 'order', _type, _title, _body, _link FROM public.admin_user_ids_and_warehouse() AS u;
$$;
REVOKE ALL ON FUNCTION public.notify_warehouse(text, text, text, text) FROM public, anon, authenticated;

-- A working day at the warehouse: not a Sunday, not a listed holiday.
CREATE OR REPLACE FUNCTION public.is_warehouse_working_day(_d date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT extract(isodow FROM _d) <> 7
     AND NOT EXISTS (SELECT 1 FROM public.warehouse_holidays WHERE holiday_date = _d);
$$;

CREATE OR REPLACE FUNCTION public.add_warehouse_working_days(_d date, _n integer)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  d date := _d;
  added integer := 0;
BEGIN
  WHILE added < coalesce(_n, 0) LOOP
    d := d + 1;
    IF public.is_warehouse_working_day(d) THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- When a parcel received at this moment must leave the warehouse: the
-- handling days count from the receiving day, or the next day if it came in
-- after the cut-off hour.
CREATE OR REPLACE FUNCTION public.warehouse_dispatch_by(_received_at timestamptz)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.add_warehouse_working_days(
    (_received_at AT TIME ZONE 'Asia/Kolkata')::date
      + CASE WHEN extract(hour FROM _received_at AT TIME ZONE 'Asia/Kolkata') >= ps.warehouse_cutoff_hour THEN 1 ELSE 0 END,
    ps.warehouse_handling_days)
  FROM public.platform_settings ps
  WHERE ps.id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Preparation time
-- ---------------------------------------------------------------------------

-- Boutique default ("ready to ship in N days"); NULL = platform default (2).
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS default_prep_days integer CHECK (default_prep_days BETWEEN 0 AND 60);

-- Per-product override, e.g. made to order in 10 days.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS prep_days integer CHECK (prep_days BETWEEN 0 AND 90),
  ADD COLUMN IF NOT EXISTS made_to_order boolean NOT NULL DEFAULT false;

-- Snapshot at checkout so a later change never moves an existing order's dates.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS prep_days integer;

CREATE OR REPLACE FUNCTION public.snapshot_order_item_prep_days()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT coalesce(p.prep_days, v.default_prep_days, ps.default_prep_days, 2)
  INTO NEW.prep_days
  FROM public.platform_settings ps
  LEFT JOIN public.products p ON p.id::text = NEW.product_id::text
  LEFT JOIN public.vendors v ON v.id = coalesce(NEW.vendor_id, p.vendor_id)
  WHERE ps.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_order_item_prep_days_trigger ON public.order_items;
CREATE TRIGGER snapshot_order_item_prep_days_trigger
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_prep_days();

-- ---------------------------------------------------------------------------
-- 4. Orders: which route they take
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfilment_route text NOT NULL DEFAULT 'direct'
    CHECK (fulfilment_route IN ('direct', 'warehouse')),
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
  -- The date shown to the customer at checkout (display only - replaced by
  -- the courier's own date once the parcel leaves the warehouse).
  ADD COLUMN IF NOT EXISTS estimated_delivery_date date;

-- Decided by the server at insert, never by the client.
CREATE OR REPLACE FUNCTION public.route_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse uuid;
BEGIN
  SELECT w.id INTO v_warehouse
  FROM public.warehouses w
  JOIN public.platform_settings ps ON ps.id AND ps.warehouse_routing_enabled
  WHERE w.is_default AND w.is_active
  LIMIT 1;

  IF v_warehouse IS NULL THEN
    NEW.fulfilment_route := 'direct';
    NEW.warehouse_id := NULL;
  ELSE
    NEW.fulfilment_route := 'warehouse';
    NEW.warehouse_id := v_warehouse;
  END IF;

  IF NEW.estimated_delivery_date IS NOT NULL
     AND NEW.estimated_delivery_date NOT BETWEEN current_date AND current_date + 120 THEN
    NEW.estimated_delivery_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS route_new_order_trigger ON public.orders;
CREATE TRIGGER route_new_order_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.route_new_order();

-- ---------------------------------------------------------------------------
-- 5. Customer parcels leaving the warehouse
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.warehouse_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  -- order: the order's own items. exchange_replacement: the replacement for
  -- an exchange. return_send_back: a return that failed inspection, going
  -- back to the customer.
  purpose text NOT NULL DEFAULT 'order'
    CHECK (purpose IN ('order', 'exchange_replacement', 'return_send_back')),
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'packing'
    CHECK (status IN ('packing', 'booked', 'shipped', 'delivered', 'ndr', 'rto', 'cancelled')),
  weight_kg numeric NOT NULL CHECK (weight_kg > 0),
  length_cm numeric NOT NULL CHECK (length_cm > 0),
  breadth_cm numeric NOT NULL CHECK (breadth_cm > 0),
  height_cm numeric NOT NULL CHECK (height_cm > 0),
  packed_by uuid REFERENCES auth.users(id),
  packed_at timestamptz NOT NULL DEFAULT now(),
  -- A parcel the courier brought back (RTO): when staff received it.
  rto_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (purpose = 'order' OR return_request_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_dispatches_order_id ON public.warehouse_dispatches(order_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_dispatches_status ON public.warehouse_dispatches(status);

CREATE TRIGGER update_warehouse_dispatches_updated_at
  BEFORE UPDATE ON public.warehouse_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. Boutique orders at the warehouse
-- ---------------------------------------------------------------------------

ALTER TABLE public.vendor_orders DROP CONSTRAINT IF EXISTS vendor_orders_status_check;
ALTER TABLE public.vendor_orders ADD CONSTRAINT vendor_orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery',
                    'delivered', 'cancelled', 'returned', 'ndr',
                    'in_transit_to_warehouse', 'at_warehouse', 'qc_failed'));

ALTER TABLE public.vendor_orders
  -- The date the boutique should hand the parcel to the courier
  -- (order date + its slowest item's preparation days).
  ADD COLUMN IF NOT EXISTS ready_by date,
  -- When the parcel is expected at the warehouse: ready_by + courier days
  -- (the courier's own date once booked). The 3-day wait counts from here.
  ADD COLUMN IF NOT EXISTS expected_at_warehouse_on date,
  -- Courier said delivered at the warehouse.
  ADD COLUMN IF NOT EXISTS arrived_at_warehouse_at timestamptz,
  -- Staff confirmed receipt and shelved it.
  ADD COLUMN IF NOT EXISTS received_at_warehouse_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS warehouse_shelf text,
  ADD COLUMN IF NOT EXISTS qc_status text CHECK (qc_status IN ('pending', 'passed', 'failed')),
  ADD COLUMN IF NOT EXISTS qc_notes text,
  ADD COLUMN IF NOT EXISTS qc_at timestamptz,
  ADD COLUMN IF NOT EXISTS qc_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS dispatch_id uuid REFERENCES public.warehouse_dispatches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS late_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS overdue_alerted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_vendor_orders_dispatch_id ON public.vendor_orders(dispatch_id);

-- ready_by / expected arrival from the items' snapshotted preparation days.
CREATE OR REPLACE FUNCTION public.plan_vendor_order_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready date;
  v_transit integer;
BEGIN
  IF NEW.vendor_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.add_warehouse_working_days((vo.created_at AT TIME ZONE 'Asia/Kolkata')::date, max(coalesce(oi.prep_days, 0)))
  INTO v_ready
  FROM public.vendor_orders vo
  JOIN public.order_items oi ON oi.vendor_order_id = vo.id
  WHERE vo.id = NEW.vendor_order_id
  GROUP BY vo.created_at;

  SELECT warehouse_inbound_transit_days INTO v_transit FROM public.platform_settings WHERE id;

  UPDATE public.vendor_orders
  SET ready_by = v_ready,
      expected_at_warehouse_on = v_ready + coalesce(v_transit, 3)
  WHERE id = NEW.vendor_order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plan_vendor_order_dates_trigger ON public.order_items;
CREATE TRIGGER plan_vendor_order_dates_trigger
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.plan_vendor_order_dates();

-- Only the server and warehouse staff move a boutique order through the
-- warehouse - boutiques can update their own vendor_orders, customers insert
-- them at checkout, and neither may touch these.
CREATE OR REPLACE FUNCTION public.guard_vendor_order_warehouse_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_server_or_warehouse() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('in_transit_to_warehouse', 'at_warehouse', 'qc_failed') THEN
      RAISE EXCEPTION 'Invalid order status';
    END IF;
    NEW.ready_by := NULL;
    NEW.expected_at_warehouse_on := NULL;
    NEW.arrived_at_warehouse_at := NULL;
    NEW.received_at_warehouse_at := NULL;
    NEW.received_by := NULL;
    NEW.warehouse_shelf := NULL;
    NEW.qc_status := NULL;
    NEW.qc_notes := NULL;
    NEW.qc_at := NULL;
    NEW.qc_by := NULL;
    NEW.dispatch_id := NULL;
    NEW.late_reminder_sent_at := NULL;
    NEW.overdue_alerted_at := NULL;
    RETURN NEW;
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status
        AND (NEW.status IN ('in_transit_to_warehouse', 'at_warehouse', 'qc_failed')
             OR OLD.status IN ('in_transit_to_warehouse', 'at_warehouse', 'qc_failed')))
     OR NEW.ready_by IS DISTINCT FROM OLD.ready_by
     OR NEW.expected_at_warehouse_on IS DISTINCT FROM OLD.expected_at_warehouse_on
     OR NEW.arrived_at_warehouse_at IS DISTINCT FROM OLD.arrived_at_warehouse_at
     OR NEW.received_at_warehouse_at IS DISTINCT FROM OLD.received_at_warehouse_at
     OR NEW.received_by IS DISTINCT FROM OLD.received_by
     OR NEW.warehouse_shelf IS DISTINCT FROM OLD.warehouse_shelf
     OR NEW.qc_status IS DISTINCT FROM OLD.qc_status
     OR NEW.qc_notes IS DISTINCT FROM OLD.qc_notes
     OR NEW.qc_at IS DISTINCT FROM OLD.qc_at
     OR NEW.qc_by IS DISTINCT FROM OLD.qc_by
     OR NEW.dispatch_id IS DISTINCT FROM OLD.dispatch_id
     OR NEW.late_reminder_sent_at IS DISTINCT FROM OLD.late_reminder_sent_at
     OR NEW.overdue_alerted_at IS DISTINCT FROM OLD.overdue_alerted_at THEN
    RAISE EXCEPTION 'Only the AllBoutiqs warehouse can change this';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_vendor_order_warehouse_fields_trigger ON public.vendor_orders;
CREATE TRIGGER guard_vendor_order_warehouse_fields_trigger
  BEFORE INSERT OR UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_order_warehouse_fields();

-- ---------------------------------------------------------------------------
-- 7. Items going back from the warehouse to a boutique
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.boutique_send_backs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_order_id uuid REFERENCES public.vendor_orders(id) ON DELETE SET NULL,
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  -- order_cancelled: customer cancelled after it reached the warehouse.
  -- qc_failed: failed inspection, item cancelled and refunded.
  -- qc_failed_replacement: failed inspection, boutique sends a replacement.
  -- return_forward: a customer return that passed inspection.
  -- exchange_forward: the old item from an exchange.
  -- replacement_qc_failed: an exchange replacement that failed inspection.
  -- replacement_unused: an exchange replacement no longer needed (the old
  --   item failed inspection).
  -- rto_cancelled: couldn't be delivered and the order was cancelled.
  reason text NOT NULL CHECK (reason IN ('order_cancelled', 'qc_failed', 'qc_failed_replacement', 'return_forward',
                                         'exchange_forward', 'replacement_qc_failed', 'replacement_unused',
                                         'rto_cancelled')),
  -- [{order_item_id, product_title, quantity, size, color, product_id}]
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'required' CHECK (status IN ('required', 'booked', 'delivered', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boutique_send_backs_status ON public.boutique_send_backs(status);
CREATE INDEX IF NOT EXISTS idx_boutique_send_backs_vendor_id ON public.boutique_send_backs(vendor_id);

CREATE TRIGGER update_boutique_send_backs_updated_at
  BEFORE UPDATE ON public.boutique_send_backs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The items of one boutique order, as a send-back snapshot.
CREATE OR REPLACE FUNCTION public.vendor_order_items_snapshot(_vendor_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'order_item_id', oi.id, 'product_id', oi.product_id, 'product_title', oi.product_title,
    'quantity', oi.quantity, 'size', oi.size, 'color', oi.color, 'sku', oi.sku, 'price', oi.price)), '[]'::jsonb)
  FROM public.order_items oi WHERE oi.vendor_order_id = _vendor_order_id;
$$;
REVOKE ALL ON FUNCTION public.vendor_order_items_snapshot(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_boutique_send_back(_vendor_order_id uuid, _reason text, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_vo record;
BEGIN
  SELECT vo.id, vo.vendor_id, vo.order_id, o.warehouse_id
  INTO v_vo
  FROM public.vendor_orders vo JOIN public.orders o ON o.id = vo.order_id
  WHERE vo.id = _vendor_order_id;
  IF NOT FOUND OR v_vo.warehouse_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- One open send-back per boutique order.
  SELECT id INTO v_id FROM public.boutique_send_backs
  WHERE vendor_order_id = _vendor_order_id AND return_request_id IS NULL AND status IN ('required', 'booked');
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.boutique_send_backs (warehouse_id, vendor_id, order_id, vendor_order_id, reason, items, notes)
  VALUES (v_vo.warehouse_id, v_vo.vendor_id, v_vo.order_id, v_vo.id, _reason,
          public.vendor_order_items_snapshot(v_vo.id), _notes)
  RETURNING id INTO v_id;

  PERFORM public.notify_vendor_members(v_vo.vendor_id, 'warehouse_send_back', 'Items coming back to you',
    format('Items from order %s are being sent back to you from the AllBoutiqs warehouse (%s).',
           public.order_ref(v_vo.order_id), replace(_reason, '_', ' ')),
    public.nlink('/vendor', 'orders', v_vo.id));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_boutique_send_back(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_boutique_send_back(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Shipments: the new legs
-- ---------------------------------------------------------------------------

ALTER TABLE public.shipments ALTER COLUMN vendor_order_id DROP NOT NULL;

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
  ADD COLUMN IF NOT EXISTS dispatch_id uuid REFERENCES public.warehouse_dispatches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_back_id uuid REFERENCES public.boutique_send_backs(id) ON DELETE SET NULL,
  -- The courier fare for this leg, and who pays it (AllBoutiqs for now).
  ADD COLUMN IF NOT EXISTS courier_cost numeric,
  ADD COLUMN IF NOT EXISTS cost_borne_by text NOT NULL DEFAULT 'allboutiqs'
    CHECK (cost_borne_by IN ('allboutiqs', 'boutique', 'customer'));

UPDATE public.shipments s
SET order_id = vo.order_id
FROM public.vendor_orders vo
WHERE vo.id = s.vendor_order_id AND s.order_id IS NULL;

ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shipments_shipment_type_check;
ALTER TABLE public.shipments ADD CONSTRAINT shipments_shipment_type_check
  CHECK (shipment_type IN ('forward', 'return', 'exchange_forward', 'exchange_return',
                           -- boutique -> warehouse (an order's parcel, or an exchange replacement)
                           'to_warehouse',
                           -- warehouse -> customer (a dispatch)
                           'warehouse_to_customer',
                           -- customer -> warehouse (a return or the old item of an exchange)
                           'return_to_warehouse',
                           -- warehouse -> boutique (a send-back)
                           'warehouse_to_boutique'));

ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shipments_has_owner;
ALTER TABLE public.shipments ADD CONSTRAINT shipments_has_owner
  CHECK (vendor_order_id IS NOT NULL OR order_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON public.shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_dispatch_id ON public.shipments(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_shipments_send_back_id ON public.shipments(send_back_id);

-- ---------------------------------------------------------------------------
-- 9. Returns through the warehouse
-- ---------------------------------------------------------------------------

ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS return_destination text CHECK (return_destination IN ('warehouse', 'boutique')),
  ADD COLUMN IF NOT EXISTS received_at_warehouse_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS warehouse_shelf text,
  ADD COLUMN IF NOT EXISTS warehouse_qc_status text CHECK (warehouse_qc_status IN ('passed', 'failed')),
  ADD COLUMN IF NOT EXISTS warehouse_qc_notes text,
  ADD COLUMN IF NOT EXISTS warehouse_qc_at timestamptz,
  ADD COLUMN IF NOT EXISTS warehouse_qc_by uuid REFERENCES auth.users(id),
  -- Exchange replacement, sent by the boutique to the warehouse.
  ADD COLUMN IF NOT EXISTS replacement_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS replacement_qc_status text CHECK (replacement_qc_status IN ('passed', 'failed')),
  ADD COLUMN IF NOT EXISTS replacement_qc_notes text;

-- Existing requests ran the old way (straight to the boutique).
UPDATE public.return_requests SET return_destination = 'boutique' WHERE return_destination IS NULL;

CREATE OR REPLACE FUNCTION public.set_return_destination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT CASE WHEN o.fulfilment_route = 'warehouse' THEN 'warehouse' ELSE 'boutique' END
  INTO NEW.return_destination
  FROM public.orders o WHERE o.id = NEW.order_id;
  NEW.return_destination := coalesce(NEW.return_destination, 'boutique');
  NEW.received_at_warehouse_at := NULL;
  NEW.received_by := NULL;
  NEW.warehouse_shelf := NULL;
  NEW.warehouse_qc_status := NULL;
  NEW.warehouse_qc_notes := NULL;
  NEW.warehouse_qc_at := NULL;
  NEW.warehouse_qc_by := NULL;
  NEW.replacement_received_at := NULL;
  NEW.replacement_qc_status := NULL;
  NEW.replacement_qc_notes := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_return_destination_trigger ON public.return_requests;
CREATE TRIGGER set_return_destination_trigger
  BEFORE INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_return_destination();

-- Admin chooses the destination, and only before a pickup is booked; the
-- warehouse columns are written only by the warehouse/server.
CREATE OR REPLACE FUNCTION public.guard_return_warehouse_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.return_destination IS DISTINCT FROM OLD.return_destination THEN
    IF current_user::text IN ('anon', 'authenticated') AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only the AllBoutiqs team can change where a return goes';
    END IF;
    IF NEW.return_destination = 'warehouse'
       AND NOT EXISTS (SELECT 1 FROM public.orders WHERE id = NEW.order_id AND warehouse_id IS NOT NULL) THEN
      RAISE EXCEPTION 'This order was not shipped through the warehouse';
    END IF;
    IF EXISTS (SELECT 1 FROM public.shipments WHERE return_request_id = NEW.id AND status <> 'cancelled') THEN
      RAISE EXCEPTION 'A courier pickup is already booked for this request - cancel it before changing where it goes';
    END IF;
  END IF;

  IF NOT public.is_server_or_warehouse() AND (
       NEW.received_at_warehouse_at IS DISTINCT FROM OLD.received_at_warehouse_at
    OR NEW.received_by IS DISTINCT FROM OLD.received_by
    OR NEW.warehouse_shelf IS DISTINCT FROM OLD.warehouse_shelf
    OR NEW.warehouse_qc_status IS DISTINCT FROM OLD.warehouse_qc_status
    OR NEW.warehouse_qc_notes IS DISTINCT FROM OLD.warehouse_qc_notes
    OR NEW.warehouse_qc_at IS DISTINCT FROM OLD.warehouse_qc_at
    OR NEW.warehouse_qc_by IS DISTINCT FROM OLD.warehouse_qc_by
    OR NEW.replacement_received_at IS DISTINCT FROM OLD.replacement_received_at
    OR NEW.replacement_qc_status IS DISTINCT FROM OLD.replacement_qc_status
    OR NEW.replacement_qc_notes IS DISTINCT FROM OLD.replacement_qc_notes
    OR (NEW.status IS DISTINCT FROM OLD.status
        AND NEW.status IN ('at_warehouse', 'qc_failed', 'qc_passed', 'replacement_shipped', 'returned_to_customer'))) THEN
    RAISE EXCEPTION 'Only the AllBoutiqs warehouse can change this';
  END IF;

  -- A warehouse return is completed by the warehouse's inspection (which
  -- issues the refund), not by hand.
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.return_destination = 'warehouse' AND NOT public.is_server_or_warehouse() THEN
    RAISE EXCEPTION 'This return is completed by the warehouse once it passes inspection';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_return_warehouse_fields_trigger ON public.return_requests;
CREATE TRIGGER guard_return_warehouse_fields_trigger
  BEFORE UPDATE ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_return_warehouse_fields();

-- ---------------------------------------------------------------------------
-- 10. Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users view warehouses"
  ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage warehouses"
  ON public.warehouses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.warehouse_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views warehouse holidays"
  ON public.warehouse_holidays FOR SELECT USING (true);
CREATE POLICY "Admins manage warehouse holidays"
  ON public.warehouse_holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Dispatches and send-backs are written only by RPCs below and edge functions.
ALTER TABLE public.warehouse_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Warehouse views dispatches"
  ON public.warehouse_dispatches FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Customers view their own dispatches"
  ON public.warehouse_dispatches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = warehouse_dispatches.order_id AND o.user_id = auth.uid()));
CREATE POLICY "Boutiques view dispatches carrying their orders"
  ON public.warehouse_dispatches FOR SELECT TO authenticated
  USING (public.order_contains_vendor_sale(order_id, auth.uid()));

ALTER TABLE public.boutique_send_backs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Warehouse views send-backs"
  ON public.boutique_send_backs FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Boutiques view their own send-backs"
  ON public.boutique_send_backs FOR SELECT TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id));

-- Warehouse staff read what they need to receive, inspect, pack and ship.
CREATE POLICY "Warehouse views orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Warehouse views order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Warehouse views vendor orders"
  ON public.vendor_orders FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Warehouse views return requests"
  ON public.return_requests FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Warehouse views shipments"
  ON public.shipments FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));

-- Shipments recorded against the order (customer parcels from the warehouse,
-- returns spanning boutiques) rather than one boutique order.
CREATE POLICY "Customers view shipments on their orders"
  ON public.shipments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = shipments.order_id AND o.user_id = auth.uid()));
CREATE POLICY "Boutiques view warehouse parcels carrying their orders"
  ON public.shipments FOR SELECT TO authenticated
  USING (dispatch_id IS NOT NULL AND public.order_contains_vendor_sale(order_id, auth.uid()));
CREATE POLICY "Boutiques view their send-back shipments"
  ON public.shipments FOR SELECT TO authenticated
  USING (send_back_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.boutique_send_backs b
    WHERE b.id = shipments.send_back_id AND public.is_vendor_member(auth.uid(), b.vendor_id)));

-- Whoever can see a shipment can see its tracking events.
CREATE POLICY "Viewers of a shipment view its events"
  ON public.shipment_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shipments s WHERE s.id = shipment_events.shipment_id));

-- ---------------------------------------------------------------------------
-- 11. Customer and boutique notifications for the warehouse route
-- ---------------------------------------------------------------------------

-- The boutique order whose row speaks for a whole customer parcel, so a parcel
-- of three boutiques' items sends one email, not three.
CREATE OR REPLACE FUNCTION public.dispatch_lead_vendor_order(_dispatch_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.vendor_orders WHERE dispatch_id = _dispatch_id ORDER BY id LIMIT 1;
$$;

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

CREATE OR REPLACE FUNCTION public.notify_customer_return_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := CASE WHEN NEW.request_type = 'exchange' THEN 'exchange' ELSE 'return' END;
  v_ref text := upper(public.order_ref(NEW.order_id));
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  CASE NEW.status
    WHEN 'approved' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_approved', format('Your %s was approved', v_kind),
        format('Your %s request for order %s was approved. A courier will pick the items up.', v_kind, v_ref));
    WHEN 'rejected' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_rejected', format('Your %s request was declined', v_kind),
        format('Your %s request for order %s was declined%s.', v_kind, v_ref,
               coalesce(': ' || nullif(coalesce(NEW.vendor_notes, NEW.admin_notes), ''), '')));
    WHEN 'pickup_scheduled' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_pickup_scheduled', 'Pickup scheduled',
        format('A courier pickup is scheduled for your %s on order %s. Please keep the items packed and ready.', v_kind, v_ref));
    WHEN 'picked_up' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_picked_up', 'Items picked up',
        format('The courier picked up your %s for order %s.', v_kind, v_ref));
    WHEN 'at_warehouse' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_at_warehouse', 'Items received',
        format('Your %s for order %s reached our quality-check centre. We''ll inspect it shortly.', v_kind, v_ref));
    WHEN 'qc_passed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_qc_passed', 'Items passed inspection',
        format('Your %s for order %s passed inspection. Your replacement will be sent as soon as it is ready.', v_kind, v_ref));
    WHEN 'qc_failed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_qc_failed', format('Your %s didn''t pass inspection', v_kind),
        format('The items from your %s for order %s didn''t pass our quality check%s. We''re sending them back to you.', v_kind, v_ref,
               coalesce(': ' || nullif(NEW.warehouse_qc_notes, ''), '')));
    WHEN 'replacement_shipped' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_replacement_shipped', 'Replacement shipped',
        format('The replacement for your exchange on order %s is on its way.', v_ref));
    WHEN 'returned_to_customer' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_sent_back', 'Items delivered back to you',
        format('The items from your %s for order %s were delivered back to you.', v_kind, v_ref));
    WHEN 'completed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_completed', format('Your %s is complete', v_kind),
        format('Your %s for order %s is complete.%s', v_kind, v_ref,
               CASE WHEN v_kind = 'return' THEN ' Your refund is on its way.' ELSE ' Your replacement has been delivered.' END));
    WHEN 'pickup_failed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_pickup_failed', 'Pickup couldn''t be completed',
        format('The courier couldn''t pick up your %s for order %s. Our team will reschedule it.', v_kind, v_ref));
    ELSE
      NULL;
  END CASE;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Watcher: late boutiques, parcels overdue at the warehouse
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.warehouse_watch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_wait integer;
  r record;
  v_vendor_name text;
  v_waiting integer;
BEGIN
  SELECT warehouse_max_wait_days INTO v_wait FROM public.platform_settings WHERE id;

  -- A boutique that hasn't booked its parcel by the end of its preparation time.
  FOR r IN
    SELECT vo.id, vo.vendor_id, vo.order_id, vo.ready_by
    FROM public.vendor_orders vo
    JOIN public.orders o ON o.id = vo.order_id
    WHERE o.fulfilment_route = 'warehouse'
      AND vo.status IN ('pending', 'confirmed')
      AND vo.ready_by IS NOT NULL AND vo.ready_by < v_today
      AND vo.late_reminder_sent_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.shipments s
        WHERE s.vendor_order_id = vo.id AND s.shipment_type = 'to_warehouse'
          AND s.return_request_id IS NULL AND s.status <> 'cancelled')
  LOOP
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = r.vendor_id;
    PERFORM public.notify_vendor_members(r.vendor_id, 'warehouse_ship_late', 'Order is late to ship',
      format('Order %s was due to be handed to the courier by %s. Please book the pickup to the AllBoutiqs warehouse now.',
             public.order_ref(r.order_id), to_char(r.ready_by, 'DD Mon')),
      public.nlink('/vendor', 'orders', r.id));
    PERFORM public.notify_admins('order', 'warehouse_ship_late', 'Boutique is late to ship',
      format('%s has not booked order %s, which was due by %s.',
             coalesce(v_vendor_name, 'A boutique'), public.order_ref(r.order_id), to_char(r.ready_by, 'DD Mon')),
      public.nlink('/admin', 'orders', r.id));
    UPDATE public.vendor_orders SET late_reminder_sent_at = now() WHERE id = r.id;
  END LOOP;

  -- A parcel more than the wait limit past its expected arrival.
  FOR r IN
    SELECT vo.id, vo.vendor_id, vo.order_id, vo.expected_at_warehouse_on
    FROM public.vendor_orders vo
    JOIN public.orders o ON o.id = vo.order_id
    WHERE o.fulfilment_route = 'warehouse'
      AND vo.status IN ('pending', 'confirmed', 'processing', 'in_transit_to_warehouse')
      AND vo.overdue_alerted_at IS NULL
      AND vo.expected_at_warehouse_on IS NOT NULL
      AND vo.expected_at_warehouse_on + coalesce(v_wait, 3) < v_today
  LOOP
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = r.vendor_id;
    SELECT count(*) INTO v_waiting FROM public.vendor_orders
    WHERE order_id = r.order_id AND id <> r.id AND status = 'at_warehouse';
    PERFORM public.notify_warehouse('warehouse_parcel_overdue', 'Parcel overdue at the warehouse',
      format('The parcel from %s for order %s was expected by %s and hasn''t arrived.%s',
             coalesce(v_vendor_name, 'a boutique'), public.order_ref(r.order_id), to_char(r.expected_at_warehouse_on, 'DD Mon'),
             CASE WHEN v_waiting > 0
                  THEN format(' %s other part(s) are waiting. Admin: send what has arrived, or cancel the missing item.', v_waiting)
                  ELSE ' Admin: chase the boutique or cancel the item.' END),
      '/warehouse?tab=pack&focus=' || r.order_id::text);
    UPDATE public.vendor_orders SET overdue_alerted_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

SELECT cron.schedule('warehouse-watch', '*/30 * * * *', $$SELECT public.warehouse_watch();$$);

-- ---------------------------------------------------------------------------
-- 13. Warehouse actions (database-only steps; courier bookings and refunds
--     run in the warehouse-actions edge function)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_warehouse_operator()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_operate_warehouse(auth.uid()) THEN
    RAISE EXCEPTION 'Only AllBoutiqs warehouse staff can do this';
  END IF;
END;
$$;

-- Staff confirm a boutique's parcel is in, and where it's shelved.
CREATE OR REPLACE FUNCTION public.warehouse_receive_parcel(_vendor_order_id uuid, _shelf text DEFAULT NULL)
RETURNS public.vendor_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.vendor_orders;
  v_route text;
  v_shelf text := nullif(trim(coalesce(_shelf, '')), '');
BEGIN
  PERFORM public.assert_warehouse_operator();
  SELECT * INTO v FROM public.vendor_orders WHERE id = _vendor_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  SELECT fulfilment_route INTO v_route FROM public.orders WHERE id = v.order_id;
  IF v_route IS DISTINCT FROM 'warehouse' THEN
    RAISE EXCEPTION 'This order ships straight from the boutique, not through the warehouse';
  END IF;

  IF v.status = 'cancelled' THEN
    -- Cancelled while it was on its way: it goes straight back to the boutique.
    UPDATE public.vendor_orders
    SET arrived_at_warehouse_at = coalesce(arrived_at_warehouse_at, now()),
        received_at_warehouse_at = coalesce(received_at_warehouse_at, now()),
        received_by = coalesce(received_by, auth.uid()),
        warehouse_shelf = coalesce(v_shelf, warehouse_shelf)
    WHERE id = v.id
    RETURNING * INTO v;
    PERFORM public.create_boutique_send_back(v.id, 'order_cancelled', 'Cancelled while on its way to the warehouse');
    RETURN v;
  END IF;

  IF v.status NOT IN ('pending', 'confirmed', 'processing', 'in_transit_to_warehouse', 'at_warehouse') THEN
    RAISE EXCEPTION 'This parcel is already %', replace(v.status, '_', ' ');
  END IF;
  IF v.dispatch_id IS NOT NULL THEN
    RAISE EXCEPTION 'This parcel is already packed for the customer';
  END IF;

  UPDATE public.vendor_orders
  SET status = 'at_warehouse',
      arrived_at_warehouse_at = coalesce(arrived_at_warehouse_at, now()),
      received_at_warehouse_at = coalesce(received_at_warehouse_at, now()),
      received_by = coalesce(received_by, auth.uid()),
      warehouse_shelf = coalesce(v_shelf, warehouse_shelf),
      qc_status = coalesce(qc_status, 'pending')
  WHERE id = v.id
  RETURNING * INTO v;
  RETURN v;
END;
$$;

-- Inspection result for a boutique's parcel.
CREATE OR REPLACE FUNCTION public.warehouse_record_qc(_vendor_order_id uuid, _passed boolean, _notes text DEFAULT NULL)
RETURNS public.vendor_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.vendor_orders;
  v_notes text := nullif(trim(coalesce(_notes, '')), '');
BEGIN
  PERFORM public.assert_warehouse_operator();
  SELECT * INTO v FROM public.vendor_orders WHERE id = _vendor_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v.received_at_warehouse_at IS NULL OR v.status NOT IN ('at_warehouse', 'qc_failed') THEN
    RAISE EXCEPTION 'Receive this parcel before inspecting it';
  END IF;
  IF v.dispatch_id IS NOT NULL THEN
    RAISE EXCEPTION 'This parcel is already packed for the customer';
  END IF;

  IF _passed THEN
    UPDATE public.vendor_orders
    SET status = 'at_warehouse', qc_status = 'passed', qc_notes = v_notes, qc_at = now(), qc_by = auth.uid()
    WHERE id = v.id
    RETURNING * INTO v;
  ELSE
    IF v_notes IS NULL THEN
      RAISE EXCEPTION 'Describe what is wrong with the item';
    END IF;
    UPDATE public.vendor_orders
    SET status = 'qc_failed', qc_status = 'failed', qc_notes = v_notes, qc_at = now(), qc_by = auth.uid()
    WHERE id = v.id
    RETURNING * INTO v;

    PERFORM public.notify_admins('order', 'warehouse_qc_failed', 'Item failed inspection',
      format('An item in order %s failed inspection: %s. Decide: cancel and refund it, or ask the boutique for a replacement.',
             public.order_ref(v.order_id), v_notes),
      '/warehouse?tab=inspect&focus=' || v.id::text);
    PERFORM public.notify_vendor_members(v.vendor_id, 'warehouse_qc_failed', 'Item failed inspection',
      format('An item you sent for order %s failed our quality check: %s. The AllBoutiqs team will cancel it or ask you for a replacement.',
             public.order_ref(v.order_id), v_notes),
      public.nlink('/vendor', 'orders', v.id));
  END IF;
  RETURN v;
END;
$$;

-- Pack an order: every part must be in and passed. Only an admin may pack
-- part of an order (after the wait limit, "send what has arrived").
CREATE OR REPLACE FUNCTION public.warehouse_create_dispatch(
  _order_id uuid,
  _vendor_order_ids uuid[],
  _weight_kg numeric,
  _length_cm numeric,
  _breadth_cm numeric,
  _height_cm numeric,
  _allow_partial boolean DEFAULT false
)
RETURNS public.warehouse_dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_dispatch public.warehouse_dispatches;
  v_bad integer;
  v_missing integer;
BEGIN
  PERFORM public.assert_warehouse_operator();
  SELECT id, fulfilment_route, warehouse_id INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.fulfilment_route IS DISTINCT FROM 'warehouse' THEN
    RAISE EXCEPTION 'This order ships straight from the boutique';
  END IF;
  IF coalesce(array_length(_vendor_order_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose what goes in the parcel';
  END IF;
  IF coalesce(_weight_kg, 0) <= 0 OR coalesce(_length_cm, 0) <= 0 OR coalesce(_breadth_cm, 0) <= 0 OR coalesce(_height_cm, 0) <= 0 THEN
    RAISE EXCEPTION 'Enter the packed parcel''s weight and size';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.vendor_orders
  WHERE id = ANY (_vendor_order_ids)
    AND (order_id <> _order_id OR status <> 'at_warehouse' OR qc_status IS DISTINCT FROM 'passed' OR dispatch_id IS NOT NULL);
  IF v_bad > 0 OR (SELECT count(*) FROM public.vendor_orders WHERE id = ANY (_vendor_order_ids)) <> array_length(_vendor_order_ids, 1) THEN
    RAISE EXCEPTION 'Every part in the parcel must be received, pass inspection and not be packed already';
  END IF;

  SELECT count(*) INTO v_missing
  FROM public.vendor_orders
  WHERE order_id = _order_id AND NOT (id = ANY (_vendor_order_ids))
    AND status NOT IN ('cancelled', 'delivered', 'returned', 'shipped', 'out_for_delivery', 'ndr')
    AND dispatch_id IS NULL;
  IF v_missing > 0 AND NOT (_allow_partial AND public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not every part of this order is ready. Only an admin can send part of an order.';
  END IF;

  INSERT INTO public.warehouse_dispatches (order_id, warehouse_id, purpose, weight_kg, length_cm, breadth_cm, height_cm, packed_by)
  VALUES (_order_id, v_order.warehouse_id, 'order', _weight_kg, _length_cm, _breadth_cm, _height_cm, auth.uid())
  RETURNING * INTO v_dispatch;

  UPDATE public.vendor_orders SET dispatch_id = v_dispatch.id WHERE id = ANY (_vendor_order_ids);
  RETURN v_dispatch;
END;
$$;

-- Fix the packed parcel's weight/size before it's booked.
CREATE OR REPLACE FUNCTION public.warehouse_update_dispatch_parcel(
  _dispatch_id uuid, _weight_kg numeric, _length_cm numeric, _breadth_cm numeric, _height_cm numeric
)
RETURNS public.warehouse_dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.warehouse_dispatches;
BEGIN
  PERFORM public.assert_warehouse_operator();
  IF coalesce(_weight_kg, 0) <= 0 OR coalesce(_length_cm, 0) <= 0 OR coalesce(_breadth_cm, 0) <= 0 OR coalesce(_height_cm, 0) <= 0 THEN
    RAISE EXCEPTION 'Enter the packed parcel''s weight and size';
  END IF;
  UPDATE public.warehouse_dispatches
  SET weight_kg = _weight_kg, length_cm = _length_cm, breadth_cm = _breadth_cm, height_cm = _height_cm
  WHERE id = _dispatch_id AND status = 'packing'
  RETURNING * INTO v;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'Only a parcel that isn''t booked yet can be changed';
  END IF;
  RETURN v;
END;
$$;

-- Unpack (before booking): the parts go back to "ready to pack".
CREATE OR REPLACE FUNCTION public.warehouse_cancel_dispatch(_dispatch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.warehouse_dispatches;
BEGIN
  PERFORM public.assert_warehouse_operator();
  SELECT * INTO v FROM public.warehouse_dispatches WHERE id = _dispatch_id FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'packing' THEN
    RAISE EXCEPTION 'Only a parcel that isn''t booked yet can be unpacked - cancel the courier booking first';
  END IF;
  UPDATE public.vendor_orders SET dispatch_id = NULL WHERE dispatch_id = _dispatch_id;
  UPDATE public.warehouse_dispatches SET status = 'cancelled' WHERE id = _dispatch_id;
END;
$$;

-- A parcel the courier brought back (RTO) is in again; admin then decides to
-- send it again or cancel the order.
CREATE OR REPLACE FUNCTION public.warehouse_receive_rto(_dispatch_id uuid)
RETURNS public.warehouse_dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.warehouse_dispatches;
BEGIN
  PERFORM public.assert_warehouse_operator();
  UPDATE public.warehouse_dispatches
  SET rto_received_at = coalesce(rto_received_at, now())
  WHERE id = _dispatch_id AND status IN ('rto', 'ndr', 'shipped')
  RETURNING * INTO v;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'This parcel isn''t on its way back';
  END IF;
  UPDATE public.warehouse_dispatches SET status = 'rto' WHERE id = _dispatch_id;
  PERFORM public.notify_admins('order', 'warehouse_rto_received', 'Undelivered parcel is back',
    format('The undelivered parcel for order %s is back at the warehouse. Send it again or cancel the order.', public.order_ref(v.order_id)),
    '/warehouse?tab=dispatched&focus=' || v.order_id::text);
  SELECT * INTO v FROM public.warehouse_dispatches WHERE id = _dispatch_id;
  RETURN v;
END;
$$;

-- Admin: send an undelivered order again (it goes back to "ready to pack").
CREATE OR REPLACE FUNCTION public.admin_redispatch_after_rto(_dispatch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.warehouse_dispatches;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can decide this';
  END IF;
  SELECT * INTO v FROM public.warehouse_dispatches WHERE id = _dispatch_id FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'rto' OR v.rto_received_at IS NULL THEN
    RAISE EXCEPTION 'The parcel must be back at the warehouse first';
  END IF;
  UPDATE public.vendor_orders
  SET status = 'at_warehouse', dispatch_id = NULL
  WHERE dispatch_id = _dispatch_id AND status IN ('returned', 'ndr', 'shipped', 'out_for_delivery');
  UPDATE public.warehouse_dispatches SET status = 'cancelled' WHERE id = _dispatch_id;
END;
$$;

-- A return (or the old item of an exchange) has arrived at the warehouse.
CREATE OR REPLACE FUNCTION public.warehouse_receive_return(_return_request_id uuid, _shelf text DEFAULT NULL)
RETURNS public.return_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.return_requests;
BEGIN
  PERFORM public.assert_warehouse_operator();
  SELECT * INTO v FROM public.return_requests WHERE id = _return_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return request not found';
  END IF;
  IF v.return_destination IS DISTINCT FROM 'warehouse' THEN
    RAISE EXCEPTION 'This return goes straight to the boutique';
  END IF;
  IF v.status NOT IN ('approved', 'pickup_scheduled', 'picked_up', 'pickup_failed', 'at_warehouse') THEN
    RAISE EXCEPTION 'This return is %', replace(v.status, '_', ' ');
  END IF;
  UPDATE public.return_requests
  SET status = 'at_warehouse',
      received_at_warehouse_at = coalesce(received_at_warehouse_at, now()),
      received_by = coalesce(received_by, auth.uid()),
      warehouse_shelf = coalesce(nullif(trim(coalesce(_shelf, '')), ''), warehouse_shelf)
  WHERE id = v.id
  RETURNING * INTO v;
  RETURN v;
END;
$$;

-- An exchange's replacement has arrived from the boutique.
CREATE OR REPLACE FUNCTION public.warehouse_receive_replacement(_return_request_id uuid)
RETURNS public.return_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.return_requests;
BEGIN
  PERFORM public.assert_warehouse_operator();
  UPDATE public.return_requests
  SET replacement_received_at = coalesce(replacement_received_at, now())
  WHERE id = _return_request_id AND request_type = 'exchange' AND return_destination = 'warehouse'
    AND status NOT IN ('rejected', 'cancelled', 'completed', 'replacement_shipped')
  RETURNING * INTO v;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'No open warehouse exchange found for this replacement';
  END IF;
  RETURN v;
END;
$$;

-- Admin: give someone the warehouse staff role, or take it away.
CREATE OR REPLACE FUNCTION public.admin_set_warehouse_staff(_email text, _enabled boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can manage warehouse staff';
  END IF;
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(trim(_email));
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No account uses that email yet - ask them to sign up first';
  END IF;
  IF _enabled THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT v_user, 'warehouse_staff'::public.app_role
    WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user AND role::text = 'warehouse_staff');
  ELSE
    DELETE FROM public.user_roles WHERE user_id = v_user AND role::text = 'warehouse_staff';
  END IF;
  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_warehouse_staff()
RETURNS TABLE (user_id uuid, email text, added_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can see warehouse staff';
  END IF;
  RETURN QUERY
    SELECT ur.user_id, u.email::text, ur.created_at
    FROM public.user_roles ur JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.role::text = 'warehouse_staff'
    ORDER BY ur.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.warehouse_receive_parcel(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_record_qc(uuid, boolean, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_create_dispatch(uuid, uuid[], numeric, numeric, numeric, numeric, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_update_dispatch_parcel(uuid, numeric, numeric, numeric, numeric) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_cancel_dispatch(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_receive_rto(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_redispatch_after_rto(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_receive_return(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_receive_replacement(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_set_warehouse_staff(text, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_list_warehouse_staff() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.warehouse_receive_parcel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_record_qc(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_create_dispatch(uuid, uuid[], numeric, numeric, numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_update_dispatch_parcel(uuid, numeric, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_cancel_dispatch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_receive_rto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_redispatch_after_rto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_receive_return(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_receive_replacement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_warehouse_staff(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_warehouse_staff() TO authenticated;

-- ===== [068/100] 20261012100000_order_status_and_return_window.sql =====
-- Two business rules, for direct and warehouse orders alike:
--
-- 1. The whole order's status follows its boutique parts automatically (it
--    used to stay "pending" forever unless an admin changed it by hand, so
--    customers never saw the Return / Exchange button, the admin Orders tabs
--    and the dashboard's pending count were wrong). Admin can still change it
--    by hand for an exception; the next change to a part re-derives it.
--
-- 2. A part can be returned or exchanged once THAT part is delivered, until
--    its boutique's return window ends (delivery date + return_window_days).
--    Enforced here, not only in the app: boutique payouts are released after
--    the same window, so a late return would otherwise come after the boutique
--    was already paid. An admin can extend one part's window for an exception.

-- ---------------------------------------------------------------------------
-- 1. Whole-order status
-- ---------------------------------------------------------------------------

-- all cancelled                      -> cancelled
-- all delivered (or cancelled)       -> delivered
-- any part with the courier/customer -> shipped
-- any part being prepared/at warehouse -> processing
-- any part confirmed                 -> confirmed
-- otherwise                          -> pending
CREATE OR REPLACE FUNCTION public.derive_order_status(_order_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN count(*) = 0 THEN NULL
    WHEN bool_and(status = 'cancelled') THEN 'cancelled'
    WHEN bool_and(status IN ('delivered', 'cancelled')) THEN 'delivered'
    WHEN bool_or(status IN ('shipped', 'out_for_delivery', 'ndr', 'delivered', 'returned')) THEN 'shipped'
    WHEN bool_or(status IN ('processing', 'in_transit_to_warehouse', 'at_warehouse', 'qc_failed')) THEN 'processing'
    WHEN bool_or(status = 'confirmed') THEN 'confirmed'
    ELSE 'pending'
  END
  FROM public.vendor_orders
  WHERE order_id = _order_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_order_status_from_parts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  v_status := public.derive_order_status(NEW.order_id);
  IF v_status IS NOT NULL THEN
    UPDATE public.orders
    SET order_status = v_status
    WHERE id = NEW.order_id AND order_status IS DISTINCT FROM v_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_order_status_from_parts_trigger ON public.vendor_orders;
CREATE TRIGGER sync_order_status_from_parts_trigger
  AFTER INSERT OR UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_status_from_parts();

-- ---------------------------------------------------------------------------
-- 2. Return window per boutique part
-- ---------------------------------------------------------------------------

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS return_window_ends_on date;

-- Set once, when the part is delivered to the customer. (Runs before
-- stamp_vendor_order_delivery_trigger - BEFORE triggers fire in name order -
-- so delivered_at may not be stamped yet.)
CREATE OR REPLACE FUNCTION public.set_return_window_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' AND NEW.return_window_ends_on IS NULL THEN
    SELECT coalesce(return_window_days, 7) INTO v_days FROM public.vendors WHERE id = NEW.vendor_id;
    NEW.return_window_ends_on :=
      (coalesce(NEW.delivered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date + coalesce(v_days, 7);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_return_window_on_delivery_trigger ON public.vendor_orders;
CREATE TRIGGER set_return_window_on_delivery_trigger
  BEFORE UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_return_window_on_delivery();

-- Only an admin (or the server) may move a window - boutiques can update
-- their own vendor_orders and must not shorten it. Named to fire before
-- set_return_window_on_delivery_trigger, which sets it on delivery.
CREATE OR REPLACE FUNCTION public.guard_vendor_order_return_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.return_window_ends_on IS DISTINCT FROM OLD.return_window_ends_on
     AND current_user::text IN ('anon', 'authenticated')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only the AllBoutiqs team can change a return window';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_vendor_order_return_window_trigger ON public.vendor_orders;
CREATE TRIGGER guard_vendor_order_return_window_trigger
  BEFORE UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_order_return_window();

-- A customer's return/exchange request: every item must be delivered and
-- inside its window. Admins and the server aren't limited.
CREATE OR REPLACE FUNCTION public.enforce_return_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR coalesce(auth.role(), 'postgres') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT oi.product_title, vo.id AS vendor_order_id, vo.status, vo.return_window_ends_on
    FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) AS e
    JOIN public.order_items oi ON oi.id::text = e->>'order_item_id'
    LEFT JOIN public.vendor_orders vo ON vo.id = oi.vendor_order_id
  LOOP
    -- Items not sold by a boutique have no delivery tracking to check.
    CONTINUE WHEN r.vendor_order_id IS NULL;
    IF r.status IS DISTINCT FROM 'delivered' THEN
      RAISE EXCEPTION '"%" hasn''t been delivered yet, so it can''t be returned or exchanged.', r.product_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF r.return_window_ends_on IS NOT NULL AND v_today > r.return_window_ends_on THEN
      RAISE EXCEPTION 'The return window for "%" closed on %.', r.product_title, to_char(r.return_window_ends_on, 'DD Mon YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_return_window_trigger ON public.return_requests;
CREATE TRIGGER enforce_return_window_trigger
  BEFORE INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_return_window();

-- ---------------------------------------------------------------------------
-- 3. Existing orders
-- ---------------------------------------------------------------------------

UPDATE public.vendor_orders vo
SET return_window_ends_on =
  (coalesce(vo.delivered_at, vo.updated_at) AT TIME ZONE 'Asia/Kolkata')::date + coalesce(v.return_window_days, 7)
FROM public.vendors v
WHERE v.id = vo.vendor_id AND vo.status = 'delivered' AND vo.return_window_ends_on IS NULL;

UPDATE public.orders o
SET order_status = public.derive_order_status(o.id)
WHERE public.derive_order_status(o.id) IS NOT NULL
  AND o.order_status IS DISTINCT FROM public.derive_order_status(o.id);

-- ===== [069/100] 20261012110000_hsn_codes.sql =====
-- GST by HSN code (customer tax invoice, step 2). Admins keep the HSN list;
-- each category points at one HSN code and its products take their GST rate
-- from it. Apparel and footwear have a price band: up to the limit per
-- piece/pair one rate (5%), above it another (18%) - fabrics, jewellery and
-- bags have one rate whatever the price (price_limit NULL).
--
-- Starter list prepared by us; AllBoutiqs will send the final one (admins
-- can edit rows or import an Excel). Rates as per the GST changes effective
-- 22 Sep 2025 - to be confirmed by the company's CA.

CREATE TABLE IF NOT EXISTS public.hsn_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9]{4,8}$'),
  description text NOT NULL,
  gst_rate numeric(5,2) NOT NULL CHECK (gst_rate >= 0 AND gst_rate <= 40),
  price_limit numeric(12,2) CHECK (price_limit > 0),
  gst_rate_above_limit numeric(5,2) CHECK (gst_rate_above_limit >= 0 AND gst_rate_above_limit <= 40),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((price_limit IS NULL) = (gst_rate_above_limit IS NULL))
);

ALTER TABLE public.hsn_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read HSN codes" ON public.hsn_codes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage HSN codes" ON public.hsn_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_hsn_codes_updated_at ON public.hsn_codes;
CREATE TRIGGER update_hsn_codes_updated_at BEFORE UPDATE ON public.hsn_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS hsn_code_id uuid REFERENCES public.hsn_codes(id) ON DELETE SET NULL;

-- GST rate for one unit sold at a GST-inclusive price. The band is decided
-- on the value before GST (price / (1 + lower rate)), the "sale value per
-- piece" the GST notification uses.
CREATE OR REPLACE FUNCTION public.gst_rate_for(_hsn_code_id uuid, _unit_price numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN h.price_limit IS NULL THEN h.gst_rate
    WHEN _unit_price / (1 + h.gst_rate / 100) <= h.price_limit THEN h.gst_rate
    ELSE h.gst_rate_above_limit
  END
  FROM public.hsn_codes h
  WHERE h.id = _hsn_code_id;
$$;

INSERT INTO public.hsn_codes (code, description, gst_rate, price_limit, gst_rate_above_limit) VALUES
  ('6206', 'Women''s blouses, shirts, kurtis, tops (woven)', 5, 2500, 18),
  ('6106', 'Women''s blouses, shirts, kurtis, tops (knitted)', 5, 2500, 18),
  ('6204', 'Women''s suits and sets, lehengas, gowns, dresses, skirts, trousers (woven)', 5, 2500, 18),
  ('6104', 'Women''s suits, dresses, skirts, trousers, leggings (knitted)', 5, 2500, 18),
  ('6109', 'T-shirts, singlets and vests (knitted)', 5, 2500, 18),
  ('6205', 'Men''s shirts and kurtas (woven)', 5, 2500, 18),
  ('6203', 'Men''s suits, sherwanis, jackets, blazers, trousers (woven)', 5, 2500, 18),
  ('6209', 'Babies'' garments (woven)', 5, 2500, 18),
  ('6111', 'Babies'' garments (knitted)', 5, 2500, 18),
  ('6208', 'Women''s nightwear, slips, petticoats (woven)', 5, 2500, 18),
  ('6108', 'Women''s nightwear and innerwear (knitted)', 5, 2500, 18),
  ('6212', 'Brassieres, corsets and similar', 5, 2500, 18),
  ('6214', 'Dupattas, stoles, shawls, scarves, veils', 5, 2500, 18),
  ('5007', 'Silk fabric - silk sarees, unstitched silk dress material', 5, NULL, NULL),
  ('5208', 'Cotton fabric - cotton sarees, unstitched cotton dress material', 5, NULL, NULL),
  ('5407', 'Synthetic fabric - georgette, chiffon and synthetic sarees, dress material', 5, NULL, NULL),
  ('6403', 'Footwear with leather uppers - juttis, mojaris (rate per pair)', 5, 2500, 18),
  ('6404', 'Footwear with textile uppers (rate per pair)', 5, 2500, 18),
  ('6402', 'Footwear with rubber or plastic uppers (rate per pair)', 5, 2500, 18),
  ('7117', 'Imitation / fashion jewellery', 3, NULL, NULL),
  ('7113', 'Gold and silver jewellery', 3, NULL, NULL),
  ('4202', 'Handbags, clutches, potli bags, wallets', 18, NULL, NULL)
ON CONFLICT (code) DO NOTHING;

-- ===== [070/100] 20261012120000_indian_states.sql =====
-- Indian states/UTs with GST state codes (invoice step 3). Addresses now
-- pick the state from a dropdown (src/lib/indianStates.ts mirrors this);
-- gst_state_code() also understands older free-text spellings, so the
-- invoice can compare the boutique's state with the delivery state.

CREATE TABLE IF NOT EXISTS public.indian_states (
  name text PRIMARY KEY,
  gst_code text NOT NULL UNIQUE CHECK (gst_code ~ '^[0-9]{2}$')
);
ALTER TABLE public.indian_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read states" ON public.indian_states FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.indian_states (name, gst_code) VALUES
  ('Jammu and Kashmir', '01'), ('Himachal Pradesh', '02'), ('Punjab', '03'), ('Chandigarh', '04'),
  ('Uttarakhand', '05'), ('Haryana', '06'), ('Delhi', '07'), ('Rajasthan', '08'), ('Uttar Pradesh', '09'),
  ('Bihar', '10'), ('Sikkim', '11'), ('Arunachal Pradesh', '12'), ('Nagaland', '13'), ('Manipur', '14'),
  ('Mizoram', '15'), ('Tripura', '16'), ('Meghalaya', '17'), ('Assam', '18'), ('West Bengal', '19'),
  ('Jharkhand', '20'), ('Odisha', '21'), ('Chhattisgarh', '22'), ('Madhya Pradesh', '23'), ('Gujarat', '24'),
  ('Dadra and Nagar Haveli and Daman and Diu', '26'), ('Maharashtra', '27'), ('Karnataka', '29'), ('Goa', '30'),
  ('Lakshadweep', '31'), ('Kerala', '32'), ('Tamil Nadu', '33'), ('Puducherry', '34'),
  ('Andaman and Nicobar Islands', '35'), ('Telangana', '36'), ('Andhra Pradesh', '37'), ('Ladakh', '38')
ON CONFLICT (name) DO NOTHING;

-- GST state code for a state as typed anywhere ("Gujarat", "gujarat ",
-- "Orissa", "New Delhi", "J&K"...), or NULL if it can't be recognised.
CREATE OR REPLACE FUNCTION public.gst_state_code(_state text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH k AS (
    SELECT regexp_replace(replace(lower(coalesce(_state, '')), '&', 'and'), '[^a-z]', '', 'g') AS v
  )
  SELECT coalesce(
    (SELECT s.gst_code FROM public.indian_states s, k
      WHERE regexp_replace(lower(s.name), '[^a-z]', '', 'g') = k.v),
    (SELECT CASE k.v
       WHEN 'orissa' THEN '21'
       WHEN 'pondicherry' THEN '34'
       WHEN 'newdelhi' THEN '07'
       WHEN 'nctofdelhi' THEN '07'
       WHEN 'uttaranchal' THEN '05'
       WHEN 'andamanandnicobar' THEN '35'
       WHEN 'dadraandnagarhaveli' THEN '26'
       WHEN 'damananddiu' THEN '26'
       WHEN 'jk' THEN '01'
     END FROM k)
  );
$$;

-- ===== [071/100] 20261012130000_gst_tax_invoice.sql =====
-- Customer GST tax invoice (invoice step 4). Issued by the boutique in its
-- legal name and GSTIN, generated by AllBoutiqs on its behalf:
-- * numbering: a separate series per boutique, new every financial year:
--   <boutique code>/<FY>/<serial>, e.g. AB0001/2627/0001 (16 characters,
--   the GST maximum);
-- * one line per product with HSN, GST rate from the category's HSN code,
--   and CGST + SGST (same state) or IGST (other state).

-- Per-boutique, per-financial-year counter.
CREATE TABLE IF NOT EXISTS public.invoice_series (
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  fiscal_year text NOT NULL CHECK (fiscal_year ~ '^[0-9]{4}$'),
  last_serial integer NOT NULL DEFAULT 0,
  PRIMARY KEY (vendor_id, fiscal_year)
);
ALTER TABLE public.invoice_series ENABLE ROW LEVEL SECURITY;

-- Indian financial year (1 April - 31 March) of a moment, as "2627".
CREATE OR REPLACE FUNCTION public.fiscal_year_code(_at timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lpad(((y % 100))::text, 2, '0') || lpad((((y + 1) % 100))::text, 2, '0')
  FROM (
    SELECT CASE WHEN extract(month FROM (_at AT TIME ZONE 'Asia/Kolkata')) >= 4
                THEN extract(year FROM (_at AT TIME ZONE 'Asia/Kolkata'))::int
                ELSE extract(year FROM (_at AT TIME ZONE 'Asia/Kolkata'))::int - 1 END AS y
  ) s;
$$;

-- Next invoice number for a boutique; atomic, so two invoices can never
-- share a number.
CREATE OR REPLACE FUNCTION public.next_boutique_invoice_number(_vendor_id uuid, _at timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_fy text := public.fiscal_year_code(_at);
  v_serial integer;
BEGIN
  SELECT boutique_code INTO v_code FROM vendors WHERE id = _vendor_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Boutique % has no boutique code', _vendor_id;
  END IF;
  INSERT INTO invoice_series (vendor_id, fiscal_year, last_serial)
  VALUES (_vendor_id, v_fy, 1)
  ON CONFLICT (vendor_id, fiscal_year) DO UPDATE SET last_serial = invoice_series.last_serial + 1
  RETURNING last_serial INTO v_serial;
  RETURN v_code || '/' || v_fy || '/' || lpad(v_serial::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_boutique_invoice_number(uuid, timestamptz) FROM public, anon, authenticated;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS seller_legal_name text,
  ADD COLUMN IF NOT EXISTS seller_pan text,
  ADD COLUMN IF NOT EXISTS seller_state text,
  ADD COLUMN IF NOT EXISTS seller_state_code text,
  ADD COLUMN IF NOT EXISTS billing_state text,
  ADD COLUMN IF NOT EXISTS place_of_supply_code text,
  ADD COLUMN IF NOT EXISTS supply_type text CHECK (supply_type IN ('intra_state', 'inter_state')),
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS order_date timestamptz,
  ADD COLUMN IF NOT EXISTS taxable_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS cgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  order_item_id uuid,
  description text NOT NULL,
  hsn_code text,
  size text,
  color text,
  sku text,
  quantity integer NOT NULL,
  -- GST-inclusive price the customer saw, and this line's share of the
  -- order's discount.
  unit_price numeric(12,2) NOT NULL,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  taxable_value numeric(12,2) NOT NULL,
  gst_rate numeric(5,2) NOT NULL,
  cgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  igst_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  UNIQUE (invoice_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
-- Same people who can see the invoice (its policies apply inside EXISTS).
CREATE POLICY "Invoice lines follow their invoice"
  ON public.invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id));

-- "J&K" spelled with an ampersand.
CREATE OR REPLACE FUNCTION public.gst_state_code(_state text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH k AS (
    SELECT regexp_replace(replace(lower(coalesce(_state, '')), '&', 'and'), '[^a-z]', '', 'g') AS v
  )
  SELECT coalesce(
    (SELECT s.gst_code FROM public.indian_states s, k
      WHERE regexp_replace(lower(s.name), '[^a-z]', '', 'g') = k.v),
    (SELECT CASE k.v
       WHEN 'orissa' THEN '21'
       WHEN 'pondicherry' THEN '34'
       WHEN 'newdelhi' THEN '07'
       WHEN 'nctofdelhi' THEN '07'
       WHEN 'uttaranchal' THEN '05'
       WHEN 'andamanandnicobar' THEN '35'
       WHEN 'dadraandnagarhaveli' THEN '26'
       WHEN 'damananddiu' THEN '26'
       WHEN 'jk' THEN '01'
       WHEN 'jandk' THEN '01'
     END FROM k)
  );
$$;

-- ===== [072/100] 20261012140000_customer_shipping_switch.sql =====
-- "Rs 99 shipping -> hidden (Archive / Unarchive button in admin)": one
-- switch for whether customers are charged shipping at all. Archived (the
-- default, per the AllBoutiqs brief) = no shipping charge at checkout and
-- no "free shipping above Rs 999" messages; unarchived = the boutiques'
-- flat rate / free-above rules as before.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS customer_shipping_enabled boolean NOT NULL DEFAULT false;

-- ===== [073/100] 20261012150000_platform_rates.sql =====
-- Fees & taxes that admins can change at any time, each set with the date
-- it applies from (step 6). Orders, fee invoices and statements use the
-- rates in force on their date, so old invoices keep their old rates.
-- Versions that have already started can't be edited or deleted; admins
-- add a new version instead.

CREATE TABLE IF NOT EXISTS public.platform_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from date NOT NULL UNIQUE,
  -- AllBoutiqs fees on product value (taxable value after discount)
  marketplace_commission_pct numeric(5,2) NOT NULL DEFAULT 10 CHECK (marketplace_commission_pct BETWEEN 0 AND 100),
  technology_fee_pct numeric(5,2) NOT NULL DEFAULT 2 CHECK (technology_fee_pct BETWEEN 0 AND 100),
  fee_gst_pct numeric(5,2) NOT NULL DEFAULT 18 CHECK (fee_gst_pct BETWEEN 0 AND 40),
  fee_sac_code text NOT NULL DEFAULT '998599',
  -- Online payments only (Razorpay's fee incl. its GST); none on COD
  payment_gateway_fee_pct numeric(5,2) NOT NULL DEFAULT 2.36 CHECK (payment_gateway_fee_pct BETWEEN 0 AND 100),
  -- Courier cost of each parcel recovered from the boutique's payout
  -- (AllBoutiqs currently bears it, so off by default)
  charge_courier_to_boutique boolean NOT NULL DEFAULT false,
  -- GST TCS (0.25% CGST + 0.25% SGST same state, else 0.5% IGST)
  gst_tcs_pct numeric(5,3) NOT NULL DEFAULT 0.5 CHECK (gst_tcs_pct BETWEEN 0 AND 10),
  -- Income-tax TDS (194-O)
  tds_pct numeric(5,3) NOT NULL DEFAULT 0.1 CHECK (tds_pct BETWEEN 0 AND 10),
  tds_no_pan_pct numeric(5,3) NOT NULL DEFAULT 5 CHECK (tds_no_pan_pct BETWEEN 0 AND 30),
  tds_individual_exempt_upto numeric(14,2) NOT NULL DEFAULT 500000,
  -- Weekly payouts: orders delivered at least payout_hold_hours ago by the
  -- cut-off (ISO weekday 1=Mon..7=Sun, IST) are paid on payout_weekday
  payout_hold_hours integer NOT NULL DEFAULT 24 CHECK (payout_hold_hours BETWEEN 0 AND 2160),
  payout_cutoff_weekday smallint NOT NULL DEFAULT 2 CHECK (payout_cutoff_weekday BETWEEN 1 AND 7),
  payout_cutoff_time time NOT NULL DEFAULT '23:59',
  payout_weekday smallint NOT NULL DEFAULT 3 CHECK (payout_weekday BETWEEN 1 AND 7),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.platform_rates ENABLE ROW LEVEL SECURITY;
-- Boutiques see the rates their statements use.
CREATE POLICY "Signed-in users read rates" ON public.platform_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins add rates" ON public.platform_rates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND effective_from >= (now() AT TIME ZONE 'Asia/Kolkata')::date);
CREATE POLICY "Admins change future rates" ON public.platform_rates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins remove future rates" ON public.platform_rates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Rates that have already started are history: no edits, no deletes.
CREATE OR REPLACE FUNCTION public.protect_started_rates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF OLD.effective_from <= v_today AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'These rates have been in force since % - add a new set of rates with a future date instead', OLD.effective_from;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.effective_from < v_today THEN
    RAISE EXCEPTION 'Rates can only start today or later';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS protect_started_rates_trigger ON public.platform_rates;
CREATE TRIGGER protect_started_rates_trigger BEFORE UPDATE OR DELETE ON public.platform_rates
  FOR EACH ROW EXECUTE FUNCTION public.protect_started_rates();

CREATE OR REPLACE FUNCTION public.stamp_rates_creator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.created_by := coalesce(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS stamp_rates_creator_trigger ON public.platform_rates;
CREATE TRIGGER stamp_rates_creator_trigger BEFORE INSERT ON public.platform_rates
  FOR EACH ROW EXECUTE FUNCTION public.stamp_rates_creator();

-- The rates in force at a moment (IST date).
CREATE OR REPLACE FUNCTION public.rates_on(_at timestamptz)
RETURNS public.platform_rates
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.platform_rates
  WHERE effective_from <= (_at AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

-- Starting rates (as per the AllBoutiqs brief of 9 Oct 2026).
INSERT INTO public.platform_rates (effective_from, note)
VALUES ('2026-10-01', 'Starting rates from the AllBoutiqs brief (9 Oct 2026)')
ON CONFLICT (effective_from) DO NOTHING;

-- A boutique's own commission is now an optional override: NULL = the
-- platform's marketplace commission in force.
ALTER TABLE public.vendors ALTER COLUMN commission_rate DROP NOT NULL;
ALTER TABLE public.vendors ALTER COLUMN commission_rate DROP DEFAULT;
UPDATE public.vendors SET commission_rate = NULL WHERE commission_rate = 10;

CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_privileged_writer() THEN
      NEW.is_trusted := false;
      NEW.is_verified := false;
      NEW.commission_rate := NULL;
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  NEW.boutique_code := OLD.boutique_code;

  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  NEW.is_trusted := OLD.is_trusted;
  NEW.is_verified := OLD.is_verified;
  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.owner_user_id := OLD.owner_user_id;

  IF NEW.payout_account_status <> 'pending' THEN
    NEW.payout_account_status := OLD.payout_account_status;
  END IF;

  RETURN NEW;
END;
$$;

-- ===== [074/100] 20261012160000_founding_boutiques.sql =====
-- Founding Boutique (step 7): admins tick a boutique as a Founding Boutique
-- (shows a Founding badge) and set its period - 2 months from launch, or
-- any dates. During that period the marketplace commission is 0%; every
-- other charge still applies.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_founding boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_from date,
  ADD COLUMN IF NOT EXISTS founding_until date,
  ADD CONSTRAINT vendors_founding_period_check
    CHECK (founding_from IS NULL OR founding_until IS NULL OR founding_until >= founding_from);

-- The marketplace launch date, for the "2 months from launch" preset.
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS launch_date date;

-- Commission % for a boutique on a date: 0 inside its Founding period,
-- else its own override, else the platform rate in force.
CREATE OR REPLACE FUNCTION public.effective_commission_pct(_vendor_id uuid, _at timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN v.is_founding
     AND (v.founding_from IS NULL OR (_at AT TIME ZONE 'Asia/Kolkata')::date >= v.founding_from)
     AND (v.founding_until IS NULL OR (_at AT TIME ZONE 'Asia/Kolkata')::date <= v.founding_until)
    THEN 0
    ELSE coalesce(v.commission_rate, (public.rates_on(_at)).marketplace_commission_pct)
  END
  FROM public.vendors v
  WHERE v.id = _vendor_id;
$$;

-- Founding status is admin-only, like trust and commission.
CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_privileged_writer() THEN
      NEW.is_trusted := false;
      NEW.is_verified := false;
      NEW.commission_rate := NULL;
      NEW.is_founding := false;
      NEW.founding_from := NULL;
      NEW.founding_until := NULL;
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  NEW.boutique_code := OLD.boutique_code;

  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  NEW.is_trusted := OLD.is_trusted;
  NEW.is_verified := OLD.is_verified;
  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.is_founding := OLD.is_founding;
  NEW.founding_from := OLD.founding_from;
  NEW.founding_until := OLD.founding_until;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.owner_user_id := OLD.owner_user_id;

  IF NEW.payout_account_status <> 'pending' THEN
    NEW.payout_account_status := OLD.payout_account_status;
  END IF;

  RETURN NEW;
END;
$$;

-- ===== [075/100] 20261012170000_vendor_order_fees.sql =====
-- Every charge and tax on a boutique order, worked out by the server with
-- the rates in force on the order date (step 8). net_payable - what the
-- boutique receives and what Razorpay transfers - becomes:
--   goods paid by the customer (incl. GST, after discount)
-- + shipping, only when the boutique bears the courier cost
-- - marketplace commission (0% in a Founding period) - technology fee
-- - GST on those two fees - payment gateway fee (online orders)
-- - courier & logistics (when charged) - COD handling charge
-- - GST TCS - income-tax TDS.
-- Fees are on "product value" = taxable value after discount, before GST.

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS rates_effective_from date,
  ADD COLUMN IF NOT EXISTS goods_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goods_gst numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supply_type text CHECK (supply_type IN ('intra_state', 'inter_state')),
  ADD COLUMN IF NOT EXISTS tech_fee_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tech_fee_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_gst_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gateway_fee_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gateway_fee_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_to_boutique boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS courier_charge numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cod_handling_charge numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tcs_rate numeric(5,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tcs_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_rate numeric(5,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hsn_missing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fees_computed_at timestamptz;

CREATE OR REPLACE FUNCTION public.compute_vendor_order_fees(_vendor_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vo public.vendor_orders;
  o public.orders;
  r public.platform_rates;
  it record;
  v_gstin text;
  v_pan text;
  v_constitution text;
  v_supply text;
  v_gross numeric;
  v_disc numeric;
  v_net numeric;
  v_rate numeric;
  v_taxable numeric;
  v_goods numeric := 0;
  v_product numeric := 0;
  v_gst numeric := 0;
  v_hsn_missing boolean := false;
  v_commission_pct numeric;
  v_commission numeric;
  v_tech numeric;
  v_fee_gst numeric;
  v_gateway_rate numeric := 0;
  v_gateway numeric := 0;
  v_ship_to_boutique boolean;
  v_shipping_credit numeric;
  v_courier numeric;
  v_tcs numeric;
  v_tds_rate numeric;
  v_fy_sales numeric;
  v_fy_start date;
  v_tds numeric;
BEGIN
  SELECT * INTO vo FROM vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  -- Money already sent (or batched for sending) stays as it was.
  IF vo.rzp_transfer_id IS NOT NULL OR vo.payout_id IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO o FROM orders WHERE id = vo.order_id;
  r := rates_on(coalesce(o.created_at, now()));
  IF r.id IS NULL THEN RETURN; END IF;

  SELECT coalesce(k.gstin, v.gst_number), coalesce(k.pan, v.pan_number), k.business_constitution
  INTO v_gstin, v_pan, v_constitution
  FROM vendors v LEFT JOIN vendor_kyc k ON k.vendor_id = v.id
  WHERE v.id = vo.vendor_id;
  v_supply := CASE WHEN v_gstin IS NOT NULL AND left(v_gstin, 2) = gst_state_code(o.shipping_address->>'state')
                   THEN 'intra_state' ELSE 'inter_state' END;

  FOR it IN
    SELECT oi.price, oi.quantity, c.hsn_code_id
    FROM order_items oi
    LEFT JOIN products p ON p.id::text = oi.product_id::text
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE oi.vendor_order_id = vo.id
  LOOP
    v_gross := it.price * it.quantity;
    v_disc := CASE WHEN coalesce(o.subtotal, 0) > 0 THEN round(coalesce(o.discount_amount, 0) * v_gross / o.subtotal, 2) ELSE 0 END;
    v_net := v_gross - v_disc;
    v_rate := gst_rate_for(it.hsn_code_id, v_net / greatest(it.quantity, 1));
    IF v_rate IS NULL THEN
      v_hsn_missing := true;
      v_rate := 0;
    END IF;
    v_taxable := round(v_net / (1 + v_rate / 100), 2);
    v_goods := v_goods + v_net;
    v_product := v_product + v_taxable;
    v_gst := v_gst + (v_net - v_taxable);
  END LOOP;

  v_commission_pct := effective_commission_pct(vo.vendor_id, coalesce(o.created_at, now()));
  v_commission := round(v_product * v_commission_pct / 100, 2);
  v_tech := round(v_product * r.technology_fee_pct / 100, 2);
  v_fee_gst := round((v_commission + v_tech) * r.fee_gst_pct / 100, 2);

  -- Courier: when AllBoutiqs bears it, the customer's shipping charge is
  -- AllBoutiqs' too; when charged to the boutique, the boutique gets the
  -- shipping charge and pays the courier cost (filled in once booked).
  v_ship_to_boutique := r.charge_courier_to_boutique;
  v_shipping_credit := CASE WHEN v_ship_to_boutique THEN coalesce(vo.shipping_cost, 0) ELSE 0 END;
  v_courier := CASE WHEN v_ship_to_boutique THEN coalesce(vo.courier_charge, 0) ELSE 0 END;

  IF o.payment_method = 'razorpay' THEN
    v_gateway_rate := r.payment_gateway_fee_pct;
    v_gateway := round((v_goods + coalesce(vo.shipping_cost, 0)) * v_gateway_rate / 100, 2);
  END IF;

  v_tcs := round(v_product * r.gst_tcs_pct / 100, 2);

  -- Income-tax TDS (194-O): no PAN -> higher rate; individuals
  -- (proprietorships) and HUFs with PAN are free until their sales this
  -- financial year pass the limit; firms and companies from the first order.
  IF v_pan IS NULL THEN
    v_tds_rate := r.tds_no_pan_pct;
  ELSIF coalesce(v_constitution, 'proprietorship') IN ('proprietorship', 'huf') THEN
    v_fy_start := make_date(
      CASE WHEN extract(month FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata')) >= 4
           THEN extract(year FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata'))::int
           ELSE extract(year FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata'))::int - 1 END, 4, 1);
    SELECT coalesce(sum(x.product_value), 0) INTO v_fy_sales
    FROM vendor_orders x JOIN orders xo ON xo.id = x.order_id
    WHERE x.vendor_id = vo.vendor_id AND x.id <> vo.id AND x.status <> 'cancelled'
      AND (xo.created_at AT TIME ZONE 'Asia/Kolkata')::date >= v_fy_start
      AND xo.created_at <= coalesce(o.created_at, now());
    v_tds_rate := CASE WHEN v_fy_sales + v_product > r.tds_individual_exempt_upto THEN r.tds_pct ELSE 0 END;
  ELSE
    v_tds_rate := r.tds_pct;
  END IF;
  v_tds := round(v_product * v_tds_rate / 100, 2);

  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  UPDATE vendor_orders SET
    rates_effective_from = r.effective_from,
    goods_value = v_goods,
    product_value = v_product,
    goods_gst = v_gst,
    supply_type = v_supply,
    commission_rate = v_commission_pct,
    commission_amount = v_commission,
    tech_fee_rate = r.technology_fee_pct,
    tech_fee_amount = v_tech,
    fee_gst_rate = r.fee_gst_pct,
    fee_gst_amount = v_fee_gst,
    gateway_fee_rate = v_gateway_rate,
    gateway_fee_amount = v_gateway,
    shipping_to_boutique = v_ship_to_boutique,
    tcs_rate = r.gst_tcs_pct,
    tcs_amount = v_tcs,
    tds_rate = v_tds_rate,
    tds_amount = v_tds,
    hsn_missing = v_hsn_missing,
    net_payable = round(v_goods + v_shipping_credit - v_commission - v_tech - v_fee_gst - v_gateway
                        - v_courier - coalesce(vo.cod_handling_charge, 0) - v_tcs - v_tds, 2),
    fees_computed_at = now()
  WHERE id = vo.id;
  PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
END;
$$;
REVOKE ALL ON FUNCTION public.compute_vendor_order_fees(uuid) FROM public, anon, authenticated;

-- Recompute whenever the order's lines are written (checkout inserts the
-- boutique order first, then its items).
CREATE OR REPLACE FUNCTION public.recompute_fees_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.vendor_order_id IS NOT NULL THEN
    PERFORM compute_vendor_order_fees(OLD.vendor_order_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.vendor_order_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.vendor_order_id IS DISTINCT FROM OLD.vendor_order_id OR NEW.price IS DISTINCT FROM OLD.price OR NEW.quantity IS DISTINCT FROM OLD.quantity) THEN
    PERFORM compute_vendor_order_fees(NEW.vendor_order_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS recompute_fees_from_items_trigger ON public.order_items;
CREATE TRIGGER recompute_fees_from_items_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recompute_fees_from_items();

CREATE OR REPLACE FUNCTION public.compute_fees_on_vendor_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM compute_vendor_order_fees(NEW.id);
  RETURN NULL;
END;
$$;
-- Replaces the old commission-only insert trigger.
DROP TRIGGER IF EXISTS compute_vendor_order_commission_trigger ON public.vendor_orders;
DROP TRIGGER IF EXISTS compute_fees_on_vendor_order_insert_trigger ON public.vendor_orders;
CREATE TRIGGER compute_fees_on_vendor_order_insert_trigger
  AFTER INSERT ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.compute_fees_on_vendor_order_insert();

-- Money fields can't be written by boutiques or customers - only by the
-- fee calculation above or server-side code. (net_payable and the fees
-- were not protected before.)
CREATE OR REPLACE FUNCTION public.protect_vendor_order_payout_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() OR current_setting('app.vendor_order_fee_calc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  -- Delivery now releases real money automatically, so order status may
  -- only change through the courier webhook / server functions / admins -
  -- never directly from a boutique's session (no app screen does this).
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Order status is updated by the courier and AllBoutiqs, not directly';
  END IF;
  NEW.payout_id := OLD.payout_id;
  NEW.payout_eligible_on := OLD.payout_eligible_on;
  NEW.delivered_at := OLD.delivered_at;
  NEW.due_notified_at := OLD.due_notified_at;
  NEW.payout_notified_at := OLD.payout_notified_at;
  NEW.rzp_transfer_id := OLD.rzp_transfer_id;
  NEW.rzp_transfer_kind := OLD.rzp_transfer_kind;
  NEW.rzp_transfer_status := OLD.rzp_transfer_status;
  NEW.rzp_transfer_amount := OLD.rzp_transfer_amount;
  NEW.rzp_reversed_amount := OLD.rzp_reversed_amount;
  NEW.rzp_transfer_error := OLD.rzp_transfer_error;
  NEW.rzp_released_at := OLD.rzp_released_at;
  NEW.rzp_settlement_id := OLD.rzp_settlement_id;
  NEW.rzp_settlement_utr := OLD.rzp_settlement_utr;
  NEW.rzp_settled_at := OLD.rzp_settled_at;
  NEW.subtotal := OLD.subtotal;
  NEW.shipping_cost := OLD.shipping_cost;
  NEW.net_payable := OLD.net_payable;
  NEW.commission_rate := OLD.commission_rate;
  NEW.commission_amount := OLD.commission_amount;
  NEW.rates_effective_from := OLD.rates_effective_from;
  NEW.goods_value := OLD.goods_value;
  NEW.product_value := OLD.product_value;
  NEW.goods_gst := OLD.goods_gst;
  NEW.supply_type := OLD.supply_type;
  NEW.tech_fee_rate := OLD.tech_fee_rate;
  NEW.tech_fee_amount := OLD.tech_fee_amount;
  NEW.fee_gst_rate := OLD.fee_gst_rate;
  NEW.fee_gst_amount := OLD.fee_gst_amount;
  NEW.gateway_fee_rate := OLD.gateway_fee_rate;
  NEW.gateway_fee_amount := OLD.gateway_fee_amount;
  NEW.shipping_to_boutique := OLD.shipping_to_boutique;
  NEW.courier_charge := OLD.courier_charge;
  NEW.cod_handling_charge := OLD.cod_handling_charge;
  NEW.tcs_rate := OLD.tcs_rate;
  NEW.tcs_amount := OLD.tcs_amount;
  NEW.tds_rate := OLD.tds_rate;
  NEW.tds_amount := OLD.tds_amount;
  NEW.hsn_missing := OLD.hsn_missing;
  NEW.fees_computed_at := OLD.fees_computed_at;
  RETURN NEW;
END;
$$;

-- ===== [076/100] 20261012180000_weekly_payouts.sql =====
-- Weekly payouts (step 9): an order becomes payable payout_hold_hours (24h)
-- after delivery - and not before its return window ends or the online
-- payment has settled - and is then paid on the next payment day after a
-- weekly cut-off (Tuesday 11:59 PM -> Wednesday). Day, time and hours come
-- from the admin's rates (platform_rates). The daily Razorpay release run
-- pays everything whose payout date has come, so it pays on Wednesdays.

-- Payment date for money ready at _ready_at: the first cut-off at or after
-- it, then the payment weekday that follows that cut-off.
CREATE OR REPLACE FUNCTION public.next_payout_date(_ready_at timestamptz)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  r public.platform_rates := public.rates_on(now());
  v_local timestamp := _ready_at AT TIME ZONE 'Asia/Kolkata';
  v_cutoff timestamp;
BEGIN
  v_cutoff := (v_local::date + ((r.payout_cutoff_weekday - extract(isodow FROM v_local)::int + 7) % 7)) + r.payout_cutoff_time;
  IF v_cutoff < v_local THEN
    v_cutoff := v_cutoff + interval '7 days';
  END IF;
  RETURN v_cutoff::date + (((r.payout_weekday - r.payout_cutoff_weekday + 6) % 7) + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_order_payout_date(_vendor_order_id uuid, _delivered_at timestamptz)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_rates := public.rates_on(now());
  v_order_id uuid;
  v_method text;
  v_paid_at timestamptz;
  v_settle integer;
  v_hold_days integer;
  v_ready timestamptz;
BEGIN
  SELECT order_id INTO v_order_id FROM public.vendor_orders WHERE id = _vendor_order_id;
  SELECT payment_method INTO v_method FROM public.orders WHERE id = v_order_id;
  SELECT payout_settlement_days INTO v_settle FROM public.platform_settings WHERE id;

  -- 24 hours (admin-set) after delivery...
  v_ready := _delivered_at + make_interval(hours => coalesce(r.payout_hold_hours, 24));

  -- ...but not while a return can still come in (end of the window's last day)...
  v_hold_days := coalesce(public.vendor_order_payout_hold_days(_vendor_order_id), 0);
  IF v_hold_days > 0 THEN
    v_ready := greatest(v_ready,
      (((_delivered_at AT TIME ZONE 'Asia/Kolkata')::date + v_hold_days + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'));
  END IF;

  -- ...nor before Razorpay has settled an online payment to AllBoutiqs.
  IF v_method IS DISTINCT FROM 'cod' THEN
    SELECT min(created_at) INTO v_paid_at
    FROM public.payments
    WHERE order_id = v_order_id AND payment_status IN ('paid', 'partially_refunded', 'refunded');
    IF v_paid_at IS NOT NULL THEN
      v_ready := greatest(v_ready,
        (public.add_business_days((v_paid_at AT TIME ZONE 'Asia/Kolkata')::date, coalesce(v_settle, 2))::timestamp AT TIME ZONE 'Asia/Kolkata'));
    END IF;
  END IF;

  RETURN public.next_payout_date(v_ready);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_vendor_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_account boolean;
  v_hold integer;
  v_date text := to_char(NEW.payout_eligible_on, 'Dy DD Mon YYYY');
BEGIN
  IF NOT (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered'
          AND OLD.payout_notified_at IS NULL AND NEW.payout_notified_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = NEW.vendor_id);
  v_hold := coalesce(public.vendor_order_payout_hold_days(NEW.id), 0);
  IF v_has_account THEN
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_scheduled', 'Order delivered - payout scheduled',
      format('Order %s was delivered. Your payout of %s will be paid on %s, in the weekly payout%s.',
        public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date,
        CASE WHEN v_hold > 0 THEN format(' after the %s-day return window', v_hold) ELSE '' END),
      public.nlink('/vendor', 'payouts', NEW.id));
  ELSE
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_account_missing', 'Order delivered - add your payout account',
      format('Order %s was delivered and %s is due to you on %s, but your payout account is not set up yet. Add your bank details so we can pay you.',
        public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date),
      public.vendor_payout_account_link());
  END IF;
  PERFORM public.invoke_edge_function('send-vendor-payout-email', jsonb_build_object('vendor_order_id', NEW.id));
  RETURN NEW;
END;
$$;

-- ===== [077/100] 20261012190000_fee_invoices.sql =====
-- AllBoutiqs fee invoice (step 10): AllBoutiqs Private Limited -> boutique,
-- one per boutique per payout day, with the payout. Lines: marketplace
-- commission and technology & service fee (as worked out on each order),
-- GST at the fee rate (18%), SAC 998599: boutique registered in Gujarat ->
-- CGST + SGST, other state -> IGST. Own number series per financial year:
-- ABF/2627/00001.

CREATE TABLE IF NOT EXISTS public.fee_invoice_series (
  fiscal_year text PRIMARY KEY CHECK (fiscal_year ~ '^[0-9]{4}$'),
  last_serial integer NOT NULL DEFAULT 0
);
ALTER TABLE public.fee_invoice_series ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.fee_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  payout_date date NOT NULL,
  period_start date,
  period_end date,
  issued_at timestamptz NOT NULL DEFAULT now(),
  supplier_name text NOT NULL,
  supplier_gstin text NOT NULL,
  supplier_cin text NOT NULL,
  supplier_state_code text NOT NULL,
  recipient_name text NOT NULL,
  recipient_legal_name text,
  recipient_gstin text,
  recipient_pan text,
  recipient_address jsonb,
  recipient_state_code text,
  supply_type text NOT NULL CHECK (supply_type IN ('intra_state', 'inter_state')),
  sac_code text NOT NULL,
  order_count integer NOT NULL,
  product_value numeric(14,2) NOT NULL,
  commission_amount numeric(14,2) NOT NULL,
  tech_fee_amount numeric(14,2) NOT NULL,
  taxable_value numeric(14,2) NOT NULL,
  gst_rate numeric(5,2) NOT NULL,
  cgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  igst_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL,
  -- Commission waived for a Founding Boutique on some/all of these orders.
  founding_waiver boolean NOT NULL DEFAULT false,
  vendor_order_ids uuid[] NOT NULL,
  UNIQUE (vendor_id, payout_date)
);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_vendor ON public.fee_invoices(vendor_id, payout_date DESC);

ALTER TABLE public.fee_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Boutiques and admins read fee invoices" ON public.fee_invoices FOR SELECT TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS fee_invoice_id uuid REFERENCES public.fee_invoices(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.next_fee_invoice_number(_at timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy text := public.fiscal_year_code(_at);
  v_serial integer;
BEGIN
  INSERT INTO fee_invoice_series (fiscal_year, last_serial) VALUES (v_fy, 1)
  ON CONFLICT (fiscal_year) DO UPDATE SET last_serial = fee_invoice_series.last_serial + 1
  RETURNING last_serial INTO v_serial;
  RETURN 'ABF/' || v_fy || '/' || lpad(v_serial::text, 5, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_fee_invoice_number(timestamptz) FROM public, anon, authenticated;

-- Issue fee invoices for every boutique whose delivered orders reached
-- their payout date (by _upto) without one. Returns how many were issued.
-- Runs daily before the Razorpay release; admins can run it too.
CREATE OR REPLACE FUNCTION public.generate_fee_invoices(_upto date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upto date := coalesce(_upto, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  b record;
  v_vendor record;
  v_gstin text;
  v_state text;
  v_intra boolean;
  v_taxable numeric;
  v_tax numeric;
  v_id uuid;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can issue fee invoices';
  END IF;

  FOR b IN
    SELECT vo.vendor_id, vo.payout_eligible_on AS payout_date,
           array_agg(vo.id ORDER BY vo.delivered_at) AS ids, count(*) AS n,
           min((vo.delivered_at AT TIME ZONE 'Asia/Kolkata')::date) AS first_day,
           max((vo.delivered_at AT TIME ZONE 'Asia/Kolkata')::date) AS last_day,
           sum(vo.product_value) AS product_value, sum(vo.commission_amount) AS commission,
           sum(vo.tech_fee_amount) AS tech_fee, max(vo.fee_gst_rate) AS gst_rate,
           bool_or(vo.commission_rate = 0) AS waived
    FROM vendor_orders vo
    WHERE vo.status = 'delivered' AND vo.fee_invoice_id IS NULL
      AND vo.payout_eligible_on IS NOT NULL AND vo.payout_eligible_on <= v_upto
    GROUP BY vo.vendor_id, vo.payout_eligible_on
  LOOP
    v_taxable := round(coalesce(b.commission, 0) + coalesce(b.tech_fee, 0), 2);
    IF v_taxable <= 0 THEN CONTINUE; END IF;

    SELECT v.name, v.address, v.pan_number, v.gst_number, k.legal_business_name, k.gstin, k.pan
    INTO v_vendor
    FROM vendors v LEFT JOIN vendor_kyc k ON k.vendor_id = v.id WHERE v.id = b.vendor_id;
    v_gstin := coalesce(v_vendor.gstin, v_vendor.gst_number);
    v_state := coalesce(left(v_gstin, 2), gst_state_code(v_vendor.address->>'state'));
    v_intra := v_state = '24';
    v_tax := round(v_taxable * coalesce(b.gst_rate, 18) / 100, 2);

    INSERT INTO fee_invoices (
      invoice_number, vendor_id, payout_date, period_start, period_end,
      supplier_name, supplier_gstin, supplier_cin, supplier_state_code,
      recipient_name, recipient_legal_name, recipient_gstin, recipient_pan, recipient_address, recipient_state_code,
      supply_type, sac_code, order_count, product_value, commission_amount, tech_fee_amount, taxable_value,
      gst_rate, cgst_amount, sgst_amount, igst_amount, total, founding_waiver, vendor_order_ids
    ) VALUES (
      next_fee_invoice_number(now()), b.vendor_id, b.payout_date, b.first_day, b.last_day,
      'AllBoutiqs Private Limited', '24ABGCA7307J1ZP', 'U47912GJ2026PTC183684', '24',
      v_vendor.name, coalesce(v_vendor.legal_business_name, v_vendor.name), v_gstin,
      coalesce(v_vendor.pan, v_vendor.pan_number), v_vendor.address, v_state,
      CASE WHEN v_intra THEN 'intra_state' ELSE 'inter_state' END,
      (rates_on(now())).fee_sac_code, b.n, round(b.product_value, 2), round(b.commission, 2), round(b.tech_fee, 2), v_taxable,
      coalesce(b.gst_rate, 18),
      CASE WHEN v_intra THEN round(v_tax / 2, 2) ELSE 0 END,
      CASE WHEN v_intra THEN v_tax - round(v_tax / 2, 2) ELSE 0 END,
      CASE WHEN v_intra THEN 0 ELSE v_tax END,
      v_taxable + v_tax, coalesce(b.waived, false), b.ids
    )
    RETURNING id INTO v_id;

    UPDATE vendor_orders SET fee_invoice_id = v_id WHERE id = ANY (b.ids);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_fee_invoices(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_fee_invoices(date) TO authenticated;

-- Daily at 09:45 IST, before the 10:00 Razorpay release run.
SELECT cron.schedule('generate-fee-invoices', '15 4 * * *', $$SELECT public.generate_fee_invoices();$$);

-- ===== [078/100] 20261012200000_statement_lines.sql =====
-- Statement & tax lines (step 11): one row per boutique order placed in a
-- date range, with every charge and tax, refunds, the net taxable value
-- after returns (the GST TCS base), payout status, payment date and UTR.
-- Boutiques get only their own rows; admins one boutique or all
-- (_vendor_id NULL). Summaries (monthly GST/TCS/TDS, quarterly TDS) are
-- built from these rows in the app.

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

-- ===== [079/100] 20261012210000_cod_remittance.sql =====
-- Cash on Delivery money tracking (step 12). The courier collects the cash,
-- Shiprocket remits it to AllBoutiqs' bank, AllBoutiqs pays the boutique:
--   Collected -> Received by AllBoutiqs -> Paid to boutique.
-- shiprocket-cod-sync reads each COD parcel from Shiprocket (its COD charge
-- and remittance status / UTR / date) into shipments, then
-- apply_shipment_cod() shares the COD charge between the boutique orders in
-- the parcel (it comes off their payout) and marks their cash received.
-- Admins can also mark cash received by hand (UTR + date), e.g. when
-- Shiprocket's data is late. A COD order is paid out only once its cash has
-- been received, on the next weekly payout day after that.

ALTER TABLE public.shipments
  -- Cash the courier collects on this parcel (Shiprocket's order total)
  ADD COLUMN IF NOT EXISTS cod_amount numeric(12,2),
  -- Shiprocket's COD charge on this parcel
  ADD COLUMN IF NOT EXISTS cod_charge numeric(12,2),
  ADD COLUMN IF NOT EXISTS cod_remittance_status text,
  ADD COLUMN IF NOT EXISTS cod_remittance_utr text,
  ADD COLUMN IF NOT EXISTS cod_remitted_on date,
  ADD COLUMN IF NOT EXISTS cod_synced_at timestamptz;

ALTER TABLE public.vendor_orders
  -- When this boutique order's COD cash reached AllBoutiqs
  ADD COLUMN IF NOT EXISTS cod_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS cod_received_utr text,
  ADD COLUMN IF NOT EXISTS cod_received_source text CHECK (cod_received_source IN ('shiprocket', 'manual'));

-- Boutiques can't mark their own cash received (or unlink a fee invoice).
CREATE OR REPLACE FUNCTION public.protect_vendor_order_payout_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() OR current_setting('app.vendor_order_fee_calc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  -- Delivery now releases real money automatically, so order status may
  -- only change through the courier webhook / server functions / admins -
  -- never directly from a boutique's session (no app screen does this).
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Order status is updated by the courier and AllBoutiqs, not directly';
  END IF;
  NEW.payout_id := OLD.payout_id;
  NEW.payout_eligible_on := OLD.payout_eligible_on;
  NEW.delivered_at := OLD.delivered_at;
  NEW.due_notified_at := OLD.due_notified_at;
  NEW.payout_notified_at := OLD.payout_notified_at;
  NEW.rzp_transfer_id := OLD.rzp_transfer_id;
  NEW.rzp_transfer_kind := OLD.rzp_transfer_kind;
  NEW.rzp_transfer_status := OLD.rzp_transfer_status;
  NEW.rzp_transfer_amount := OLD.rzp_transfer_amount;
  NEW.rzp_reversed_amount := OLD.rzp_reversed_amount;
  NEW.rzp_transfer_error := OLD.rzp_transfer_error;
  NEW.rzp_released_at := OLD.rzp_released_at;
  NEW.rzp_settlement_id := OLD.rzp_settlement_id;
  NEW.rzp_settlement_utr := OLD.rzp_settlement_utr;
  NEW.rzp_settled_at := OLD.rzp_settled_at;
  NEW.subtotal := OLD.subtotal;
  NEW.shipping_cost := OLD.shipping_cost;
  NEW.net_payable := OLD.net_payable;
  NEW.commission_rate := OLD.commission_rate;
  NEW.commission_amount := OLD.commission_amount;
  NEW.rates_effective_from := OLD.rates_effective_from;
  NEW.goods_value := OLD.goods_value;
  NEW.product_value := OLD.product_value;
  NEW.goods_gst := OLD.goods_gst;
  NEW.supply_type := OLD.supply_type;
  NEW.tech_fee_rate := OLD.tech_fee_rate;
  NEW.tech_fee_amount := OLD.tech_fee_amount;
  NEW.fee_gst_rate := OLD.fee_gst_rate;
  NEW.fee_gst_amount := OLD.fee_gst_amount;
  NEW.gateway_fee_rate := OLD.gateway_fee_rate;
  NEW.gateway_fee_amount := OLD.gateway_fee_amount;
  NEW.shipping_to_boutique := OLD.shipping_to_boutique;
  NEW.courier_charge := OLD.courier_charge;
  NEW.cod_handling_charge := OLD.cod_handling_charge;
  NEW.tcs_rate := OLD.tcs_rate;
  NEW.tcs_amount := OLD.tcs_amount;
  NEW.tds_rate := OLD.tds_rate;
  NEW.tds_amount := OLD.tds_amount;
  NEW.hsn_missing := OLD.hsn_missing;
  NEW.fees_computed_at := OLD.fees_computed_at;
  NEW.fee_invoice_id := OLD.fee_invoice_id;
  NEW.cod_received_at := OLD.cod_received_at;
  NEW.cod_received_utr := OLD.cod_received_utr;
  NEW.cod_received_source := OLD.cod_received_source;
  RETURN NEW;
END;
$$;

-- Payout date: as in step 9, plus - for cash on delivery - not before the
-- courier's cash has reached AllBoutiqs (until then the date is the
-- earliest it could be).
CREATE OR REPLACE FUNCTION public.vendor_order_payout_date(_vendor_order_id uuid, _delivered_at timestamptz)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_rates := public.rates_on(now());
  v_order_id uuid;
  v_cod_at timestamptz;
  v_method text;
  v_paid_at timestamptz;
  v_settle integer;
  v_hold_days integer;
  v_ready timestamptz;
BEGIN
  SELECT order_id, cod_received_at INTO v_order_id, v_cod_at FROM public.vendor_orders WHERE id = _vendor_order_id;
  SELECT payment_method INTO v_method FROM public.orders WHERE id = v_order_id;
  SELECT payout_settlement_days INTO v_settle FROM public.platform_settings WHERE id;

  -- 24 hours (admin-set) after delivery...
  v_ready := _delivered_at + make_interval(hours => coalesce(r.payout_hold_hours, 24));

  -- ...but not while a return can still come in (end of the window's last day)...
  v_hold_days := coalesce(public.vendor_order_payout_hold_days(_vendor_order_id), 0);
  IF v_hold_days > 0 THEN
    v_ready := greatest(v_ready,
      (((_delivered_at AT TIME ZONE 'Asia/Kolkata')::date + v_hold_days + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'));
  END IF;

  IF v_method IS DISTINCT FROM 'cod' THEN
    -- ...nor before Razorpay has settled an online payment to AllBoutiqs...
    SELECT min(created_at) INTO v_paid_at
    FROM public.payments
    WHERE order_id = v_order_id AND payment_status IN ('paid', 'partially_refunded', 'refunded');
    IF v_paid_at IS NOT NULL THEN
      v_ready := greatest(v_ready,
        (public.add_business_days((v_paid_at AT TIME ZONE 'Asia/Kolkata')::date, coalesce(v_settle, 2))::timestamp AT TIME ZONE 'Asia/Kolkata'));
    END IF;
  ELSIF v_cod_at IS NOT NULL THEN
    -- ...nor before the COD cash has reached AllBoutiqs.
    v_ready := greatest(v_ready, v_cod_at);
  END IF;

  RETURN public.next_payout_date(v_ready);
END;
$$;

-- Delivered: a COD payout depends on the courier's cash arriving first.
CREATE OR REPLACE FUNCTION public.notify_vendor_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_account boolean;
  v_hold integer;
  v_date text := to_char(NEW.payout_eligible_on, 'Dy DD Mon YYYY');
  v_cod boolean;
BEGIN
  IF NOT (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered'
          AND OLD.payout_notified_at IS NULL AND NEW.payout_notified_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = NEW.vendor_id);
  v_hold := coalesce(public.vendor_order_payout_hold_days(NEW.id), 0);
  v_cod := EXISTS (SELECT 1 FROM public.orders WHERE id = NEW.order_id AND payment_method = 'cod') AND NEW.cod_received_at IS NULL;
  IF v_has_account THEN
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_scheduled', 'Order delivered - payout scheduled',
      CASE WHEN v_cod THEN
        format('Order %s was delivered and the courier collected the cash. Your payout of %s will be paid in the first weekly payout after the cash reaches AllBoutiqs from Shiprocket (%s at the earliest).',
          public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date)
      ELSE
        format('Order %s was delivered. Your payout of %s will be paid on %s, in the weekly payout%s.',
          public.order_ref(NEW.order_id), public.inr(NEW.net_payable), v_date,
          CASE WHEN v_hold > 0 THEN format(' after the %s-day return window', v_hold) ELSE '' END)
      END,
      public.nlink('/vendor', 'payouts', NEW.id));
  ELSE
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_account_missing', 'Order delivered - add your payout account',
      format('Order %s was delivered and %s is due to you%s, but your payout account is not set up yet. Add your bank details so we can pay you.',
        public.order_ref(NEW.order_id), public.inr(NEW.net_payable),
        CASE WHEN v_cod THEN ' once the courier''s cash reaches AllBoutiqs' ELSE ' on ' || v_date END),
      public.vendor_payout_account_link());
  END IF;
  PERFORM public.invoke_edge_function('send-vendor-payout-email', jsonb_build_object('vendor_order_id', NEW.id));
  RETURN NEW;
END;
$$;

-- "Payout ready" only once a COD order's cash has actually arrived.
CREATE OR REPLACE FUNCTION public.process_vendor_payout_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  r record;
  v_status text;
  v_has_account boolean;
BEGIN
  FOR r IN
    SELECT vo.vendor_id, array_agg(vo.id) AS ids, sum(vo.net_payable) AS total, count(*) AS n
    FROM public.vendor_orders vo
    JOIN public.orders o ON o.id = vo.order_id
    WHERE vo.status = 'delivered' AND vo.payout_id IS NULL AND vo.due_notified_at IS NULL
      AND vo.payout_eligible_on IS NOT NULL AND vo.payout_eligible_on <= v_today
      AND (o.payment_method IS DISTINCT FROM 'cod' OR vo.cod_received_at IS NOT NULL OR o.payment_status = 'paid')
    GROUP BY vo.vendor_id
  LOOP
    SELECT payout_account_status INTO v_status FROM public.vendors WHERE id = r.vendor_id;
    v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts WHERE vendor_id = r.vendor_id);
    IF v_has_account AND v_status IN ('pending', 'active') THEN
      PERFORM public.notify_vendor_members(r.vendor_id, 'payout_queued', 'Payout ready - in queue',
        format('%s from %s order(s) finished its return window and is now in the queue for your next bank transfer.', public.inr(r.total), r.n),
        public.nlink('/vendor', 'payouts', r.ids[1]));
    ELSE
      PERFORM public.notify_vendor_members(r.vendor_id, 'payout_account_missing', 'Payout ready - bank details needed',
        format('%s from %s order(s) is ready to pay, but %s. Update your payout details so we can send it.', public.inr(r.total), r.n,
          CASE WHEN v_status = 'needs_update' THEN 'your bank declined the last transfer' ELSE 'your payout account is not set up' END),
        public.vendor_payout_account_link());
      UPDATE public.vendors SET payout_reminder_sent_at = now() WHERE id = r.vendor_id;
    END IF;
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'queued', 'vendor_id', r.vendor_id, 'vendor_order_ids', to_jsonb(r.ids)));
    UPDATE public.vendor_orders SET due_notified_at = now() WHERE id = ANY (r.ids);
  END LOOP;

  FOR r IN
    SELECT vo.vendor_id, sum(vo.net_payable) AS total, count(*) AS n
    FROM public.vendor_orders vo
    JOIN public.vendors v ON v.id = vo.vendor_id
    WHERE vo.status = 'delivered' AND vo.payout_id IS NULL
      AND vo.payout_eligible_on IS NOT NULL AND vo.payout_eligible_on <= v_today
      AND (v.payout_account_status IN ('not_setup', 'needs_update')
           OR NOT EXISTS (SELECT 1 FROM public.vendor_payout_accounts a WHERE a.vendor_id = v.id))
      AND (v.payout_reminder_sent_at IS NULL OR v.payout_reminder_sent_at < now() - interval '7 days')
    GROUP BY vo.vendor_id
  LOOP
    PERFORM public.notify_vendor_members(r.vendor_id, 'payout_account_missing', 'Reminder: money waiting for you',
      format('%s from %s order(s) is waiting to be paid. Add or fix your payout bank details so we can transfer it.', public.inr(r.total), r.n),
      public.vendor_payout_account_link());
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'account_reminder', 'vendor_id', r.vendor_id));
    UPDATE public.vendors SET payout_reminder_sent_at = now() WHERE id = r.vendor_id;
  END LOOP;
END;
$$;

-- Cash received for these boutique orders: stamp them, move each payout to
-- the next weekly payout day after the cash arrived, tell the boutique, and
-- mark the customer order paid once every part of it has its cash.
CREATE OR REPLACE FUNCTION public.record_cod_received(_vendor_order_ids uuid[], _utr text, _received_at timestamptz, _source text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  vo record;
BEGIN
  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  WITH done AS (
    UPDATE vendor_orders x SET
      cod_received_at = least(coalesce(_received_at, now()), now()),
      cod_received_utr = nullif(btrim(_utr), ''),
      cod_received_source = _source
    FROM orders o
    WHERE x.id = ANY (_vendor_order_ids) AND o.id = x.order_id AND o.payment_method = 'cod'
      AND x.cod_received_at IS NULL AND x.status <> 'cancelled'
    RETURNING x.id
  )
  SELECT array_agg(id) INTO v_ids FROM done;
  IF v_ids IS NULL THEN
    PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
    RETURN 0;
  END IF;

  UPDATE vendor_orders SET payout_eligible_on = vendor_order_payout_date(id, delivered_at)
  WHERE id = ANY (v_ids) AND status = 'delivered' AND delivered_at IS NOT NULL
    AND payout_id IS NULL AND rzp_transfer_status IS DISTINCT FROM 'released';
  PERFORM set_config('app.vendor_order_fee_calc', 'off', true);

  FOR vo IN SELECT id, vendor_id, order_id, net_payable, payout_eligible_on, status FROM vendor_orders WHERE id = ANY (v_ids) LOOP
    PERFORM notify_vendor_members(vo.vendor_id, 'cod_received', 'COD cash received',
      format('The cash the courier collected for order %s has reached AllBoutiqs.%s', order_ref(vo.order_id),
        CASE WHEN vo.status = 'delivered' AND vo.payout_eligible_on IS NOT NULL
             THEN format(' Your payout of %s will be paid on %s.', inr(vo.net_payable), to_char(vo.payout_eligible_on, 'Dy DD Mon YYYY'))
             ELSE '' END),
      nlink('/vendor', 'payouts', vo.id));
  END LOOP;

  UPDATE orders o SET payment_status = 'paid'
  WHERE o.id IN (SELECT order_id FROM vendor_orders WHERE id = ANY (v_ids))
    AND o.payment_method = 'cod' AND o.payment_status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM vendor_orders x WHERE x.order_id = o.id AND x.status <> 'cancelled' AND x.cod_received_at IS NULL);

  RETURN array_length(v_ids, 1);
END;
$$;
REVOKE ALL ON FUNCTION public.record_cod_received(uuid[], text, timestamptz, text) FROM public, anon, authenticated;

-- An admin marking a COD order "paid" (Orders screen) marks all its parts'
-- cash received too.
CREATE OR REPLACE FUNCTION public.cod_order_marked_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_method = 'cod' AND NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM record_cod_received(
      ARRAY(SELECT id FROM vendor_orders WHERE order_id = NEW.id AND cod_received_at IS NULL AND status <> 'cancelled'),
      NULL, now(), 'manual');
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS cod_order_marked_paid_trigger ON public.orders;
CREATE TRIGGER cod_order_marked_paid_trigger
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.cod_order_marked_paid();

-- Admin: mark COD cash received by hand (bank UTR + date).
CREATE OR REPLACE FUNCTION public.mark_cod_received(_vendor_order_ids uuid[], _utr text, _received_on date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only AllBoutiqs admins can mark COD cash received';
  END IF;
  IF _received_on IS NULL OR _received_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'Enter the date the cash reached the bank (today or earlier)';
  END IF;
  RETURN record_cod_received(_vendor_order_ids, _utr,
    CASE WHEN _received_on = (now() AT TIME ZONE 'Asia/Kolkata')::date THEN now()
         ELSE (_received_on::timestamp + time '12:00') AT TIME ZONE 'Asia/Kolkata' END,
    'manual');
END;
$$;
REVOKE ALL ON FUNCTION public.mark_cod_received(uuid[], text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_cod_received(uuid[], text, date) TO authenticated;

-- After shiprocket-cod-sync has stored a parcel's Shiprocket data: share its
-- COD charge between the boutique orders in it by value (it comes off their
-- payout, until the payout is sent) and mark their cash received once
-- Shiprocket has remitted it.
CREATE OR REPLACE FUNCTION public.apply_shipment_cod(_shipment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.shipments;
  v_method text;
  v_ids uuid[];
  v_total numeric;
  v_left numeric;
  v_share numeric;
  v_n integer;
  v_i integer := 0;
  v_rows integer;
  rec record;
BEGIN
  SELECT * INTO s FROM shipments WHERE id = _shipment_id;
  IF NOT FOUND OR s.cod_amount IS NULL OR s.status = 'cancelled' THEN RETURN; END IF;
  SELECT o.payment_method INTO v_method FROM orders o
  WHERE o.id = coalesce(s.order_id, (SELECT order_id FROM vendor_orders WHERE id = s.vendor_order_id));
  IF v_method IS DISTINCT FROM 'cod' THEN RETURN; END IF;

  SELECT array_agg(id ORDER BY id), sum(goods_value) INTO v_ids, v_total
  FROM vendor_orders
  WHERE status <> 'cancelled'
    AND CASE WHEN s.shipment_type = 'warehouse_to_customer' THEN dispatch_id = s.dispatch_id ELSE id = s.vendor_order_id END;
  IF v_ids IS NULL THEN RETURN; END IF;
  v_n := array_length(v_ids, 1);

  IF s.cod_charge IS NOT NULL THEN
    v_left := s.cod_charge;
    FOR rec IN SELECT id, goods_value FROM vendor_orders WHERE id = ANY (v_ids) ORDER BY id LOOP
      v_i := v_i + 1;
      v_share := CASE WHEN v_i = v_n THEN v_left
                      WHEN coalesce(v_total, 0) > 0 THEN round(s.cod_charge * rec.goods_value / v_total, 2)
                      ELSE round(s.cod_charge / v_n, 2) END;
      v_left := v_left - v_share;
      PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
      UPDATE vendor_orders SET cod_handling_charge = v_share
      WHERE id = rec.id AND cod_handling_charge IS DISTINCT FROM v_share
        AND rzp_transfer_id IS NULL AND payout_id IS NULL;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
      IF v_rows > 0 THEN
        PERFORM compute_vendor_order_fees(rec.id);
      END IF;
    END LOOP;
  END IF;

  IF s.cod_remittance_utr IS NOT NULL OR s.cod_remitted_on IS NOT NULL THEN
    PERFORM record_cod_received(v_ids, s.cod_remittance_utr,
      CASE WHEN s.cod_remitted_on IS NULL OR s.cod_remitted_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN now()
           ELSE (s.cod_remitted_on::timestamp + time '12:00') AT TIME ZONE 'Asia/Kolkata' END,
      'shiprocket');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_shipment_cod(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_shipment_cod(uuid) TO service_role;

-- COD orders with their money stage, for the admin (one boutique or all)
-- and boutique dashboards.
CREATE OR REPLACE FUNCTION public.cod_tracking(_vendor_id uuid)
RETURNS TABLE (
  vendor_order_id uuid,
  vendor_id uuid,
  boutique_name text,
  boutique_code text,
  order_number text,
  order_date date,
  status text,
  delivered_at timestamptz,
  cod_amount numeric,
  cod_charge numeric,
  net_payable numeric,
  awb_code text,
  courier_name text,
  shiprocket_status text,
  cod_received_at timestamptz,
  cod_received_utr text,
  cod_received_source text,
  payout_on date,
  paid_at timestamptz,
  payout_utr text,
  stage text
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
    RAISE EXCEPTION 'You can only see your own orders';
  END IF;

  RETURN QUERY
  SELECT vo.id, vo.vendor_id, v.name, v.boutique_code,
         '#' || upper(left(vo.order_id::text, 8)),
         (o.created_at AT TIME ZONE 'Asia/Kolkata')::date,
         vo.status, vo.delivered_at,
         round(vo.goods_value + coalesce(vo.shipping_cost, 0), 2),
         vo.cod_handling_charge, vo.net_payable,
         s.awb_code, s.courier_name, s.cod_remittance_status,
         vo.cod_received_at, vo.cod_received_utr, vo.cod_received_source,
         vo.payout_eligible_on,
         coalesce(vo.rzp_released_at, vp.paid_at),
         coalesce(vo.rzp_settlement_utr, vp.payment_reference),
         CASE
           WHEN vo.status = 'cancelled' THEN 'cancelled'
           WHEN s.status = 'rto' THEN 'not_collected'
           WHEN coalesce(vo.rzp_released_at, vp.paid_at) IS NOT NULL THEN 'paid'
           WHEN vo.cod_received_at IS NOT NULL THEN 'received'
           WHEN vo.delivered_at IS NOT NULL OR vo.status IN ('delivered', 'returned') THEN 'collected'
           ELSE 'awaiting_delivery'
         END
  FROM vendor_orders vo
  JOIN orders o ON o.id = vo.order_id
  JOIN vendors v ON v.id = vo.vendor_id
  LEFT JOIN vendor_payouts vp ON vp.id = vo.payout_id AND vp.status = 'paid'
  LEFT JOIN LATERAL (
    SELECT sh.awb_code, sh.courier_name, sh.cod_remittance_status, sh.status
    FROM shipments sh
    WHERE sh.status <> 'cancelled'
      AND ((sh.shipment_type = 'forward' AND sh.vendor_order_id = vo.id)
           OR (sh.shipment_type = 'warehouse_to_customer' AND vo.dispatch_id IS NOT NULL AND sh.dispatch_id = vo.dispatch_id))
    ORDER BY sh.created_at DESC
    LIMIT 1
  ) s ON true
  WHERE o.payment_method = 'cod'
    AND (_vendor_id IS NULL OR vo.vendor_id = _vendor_id)
    AND o.created_at > now() - interval '1 year'
  ORDER BY o.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.cod_tracking(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cod_tracking(uuid) TO authenticated;

-- Read Shiprocket's COD data before the 10:00 payout run, and again in the
-- evening.
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('shiprocket-cod-sync-morning', 'shiprocket-cod-sync-evening');
SELECT cron.schedule('shiprocket-cod-sync-morning', '0 3 * * *', $$SELECT public.invoke_edge_function('shiprocket-cod-sync', '{}'::jsonb);$$);
SELECT cron.schedule('shiprocket-cod-sync-evening', '30 13 * * *', $$SELECT public.invoke_edge_function('shiprocket-cod-sync', '{}'::jsonb);$$);

-- ===== [080/100] 20261015100000_unpaid_online_orders.sql =====
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

-- ===== [081/100] 20261015110000_product_customisation.sql =====
-- Customisation: a product can be made to the customer's own measurements
-- and/or with extra options, each with its own price added to the product's.
-- The boutique sets it up per product (admins can change it on any product):
--   customisable            on/off
--   custom_size_price       price for making it to the customer's measurements
--                           (NULL = not offered; 0 = free)
--   customisation_options   [{id, label, price}] e.g. "Sleeve length change" +200
--   customisation_days      extra making days for a customised piece
-- The customer picks options, enters measurements, a note and a reference
-- photo. The order line keeps a snapshot (order_items.customisation) priced
-- by the server from the product - never by the browser - and its extra
-- price (customisation_price) is included in order_items.price, so totals,
-- GST, fees, invoices and payouts all include it. A customised piece is
-- made to measure: it can't be returned or exchanged.

-- ---------------------------------------------------------------------------
-- Product set-up
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS customisable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customisation_options jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(customisation_options) = 'array'),
  ADD COLUMN IF NOT EXISTS custom_size_price numeric(10,2) CHECK (custom_size_price >= 0),
  ADD COLUMN IF NOT EXISTS customisation_days integer CHECK (customisation_days BETWEEN 0 AND 60);

CREATE OR REPLACE FUNCTION public.validate_product_customisation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  o jsonb;
BEGIN
  IF jsonb_array_length(NEW.customisation_options) > 20 THEN
    RAISE EXCEPTION 'A product can have up to 20 customisation options' USING ERRCODE = 'check_violation';
  END IF;
  FOR o IN SELECT e FROM jsonb_array_elements(NEW.customisation_options) e LOOP
    IF coalesce(btrim(o->>'id'), '') = '' OR coalesce(btrim(o->>'label'), '') = '' THEN
      RAISE EXCEPTION 'Every customisation option needs a name' USING ERRCODE = 'check_violation';
    END IF;
    IF length(o->>'label') > 80 THEN
      RAISE EXCEPTION 'Customisation option names can be up to 80 characters' USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_typeof(o->'price') <> 'number' OR (o->>'price')::numeric < 0 OR (o->>'price')::numeric > 100000 THEN
      RAISE EXCEPTION 'The price of "%" must be between ₹0 and ₹1,00,000', o->>'label' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF NEW.customisable AND jsonb_array_length(NEW.customisation_options) = 0 AND NEW.custom_size_price IS NULL THEN
    RAISE EXCEPTION 'To offer customisation, add a custom size price or at least one option' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_product_customisation_trigger ON public.products;
CREATE TRIGGER validate_product_customisation_trigger
  BEFORE INSERT OR UPDATE OF customisable, customisation_options, custom_size_price ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_customisation();

-- ---------------------------------------------------------------------------
-- Order lines
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_items
  -- {options:[{id,label,price}], custom_size:{price,unit,measurements}|null,
  --  note, photo_path, days}
  ADD COLUMN IF NOT EXISTS customisation jsonb,
  -- Per unit, already included in price.
  ADD COLUMN IF NOT EXISTS customisation_price numeric(10,2) NOT NULL DEFAULT 0;

-- Rebuilds the customer's choice from the product's own options and prices
-- (whatever the browser sent), and marks the line not returnable.
CREATE OR REPLACE FUNCTION public.enforce_order_item_customisation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.products;
  c jsonb := NEW.customisation;
  o jsonb;
  po jsonb;
  v_opts jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_size jsonb;
  v_meas jsonb := '{}'::jsonb;
  m record;
  v_note text;
  v_photo text;
BEGIN
  IF c IS NULL OR jsonb_typeof(c) <> 'object' THEN
    NEW.customisation := NULL;
    NEW.customisation_price := 0;
    RETURN NEW;
  END IF;

  SELECT * INTO p FROM public.products WHERE id::text = NEW.product_id::text;
  IF NOT FOUND OR NOT p.customisable THEN
    RAISE EXCEPTION '"%" can''t be customised any more - please remove the customisation and add it again.', NEW.product_title
      USING ERRCODE = 'check_violation';
  END IF;

  -- Options, at the product's prices.
  FOR o IN SELECT DISTINCT ON (e->>'id') e FROM jsonb_array_elements(coalesce(c->'options', '[]'::jsonb)) e LOOP
    SELECT e INTO po FROM jsonb_array_elements(p.customisation_options) e WHERE e->>'id' = o->>'id';
    IF po IS NULL THEN
      RAISE EXCEPTION 'A customisation chosen for "%" is no longer offered - please choose again.', NEW.product_title
        USING ERRCODE = 'check_violation';
    END IF;
    v_opts := v_opts || jsonb_build_array(jsonb_build_object('id', po->>'id', 'label', po->>'label', 'price', (po->>'price')::numeric));
    v_total := v_total + (po->>'price')::numeric;
  END LOOP;

  -- Made to the customer's measurements.
  IF jsonb_typeof(c->'custom_size') = 'object' THEN
    IF p.custom_size_price IS NULL THEN
      RAISE EXCEPTION 'Custom size isn''t offered for "%".', NEW.product_title USING ERRCODE = 'check_violation';
    END IF;
    FOR m IN SELECT key, btrim(value) AS value FROM jsonb_each_text(coalesce(c->'custom_size'->'measurements', '{}'::jsonb)) LOOP
      IF m.value <> '' THEN
        v_meas := v_meas || jsonb_build_object(left(m.key, 40), left(m.value, 20));
      END IF;
    END LOOP;
    IF v_meas = '{}'::jsonb THEN
      RAISE EXCEPTION 'Please enter your measurements for "%".', NEW.product_title USING ERRCODE = 'check_violation';
    END IF;
    v_size := jsonb_build_object('price', p.custom_size_price, 'unit', 'in', 'measurements', v_meas);
    v_total := v_total + p.custom_size_price;
  END IF;

  v_note := nullif(left(btrim(coalesce(c->>'note', '')), 1000), '');
  v_photo := nullif(btrim(coalesce(c->>'photo_path', '')), '');
  IF v_photo IS NOT NULL AND NOT public.is_privileged_writer() AND split_part(v_photo, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'That reference photo can''t be used.' USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_array_length(v_opts) = 0 AND v_size IS NULL AND v_note IS NULL AND v_photo IS NULL THEN
    NEW.customisation := NULL;
    NEW.customisation_price := 0;
    RETURN NEW;
  END IF;

  NEW.customisation := jsonb_build_object(
    'options', v_opts, 'custom_size', v_size, 'note', v_note, 'photo_path', v_photo,
    'days', coalesce(p.customisation_days, 0));
  NEW.customisation_price := v_total;
  -- Made to measure: no return or exchange.
  NEW.is_returnable := false;
  IF NEW.price < v_total THEN
    RAISE EXCEPTION 'The price of "%" doesn''t include its customisation - please add it to your cart again.', NEW.product_title
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_order_item_customisation_trigger ON public.order_items;
CREATE TRIGGER enforce_order_item_customisation_trigger
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_customisation();

-- Making time: the product's preparation days plus, for a customised
-- piece, its customisation days. (Runs after the trigger above -
-- triggers fire in name order.)
CREATE OR REPLACE FUNCTION public.snapshot_order_item_prep_days()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT coalesce(p.prep_days, v.default_prep_days, ps.default_prep_days, 2)
  INTO NEW.prep_days
  FROM public.platform_settings ps
  LEFT JOIN public.products p ON p.id::text = NEW.product_id::text
  LEFT JOIN public.vendors v ON v.id = coalesce(NEW.vendor_id, p.vendor_id)
  WHERE ps.id;
  IF NEW.customisation IS NOT NULL THEN
    NEW.prep_days := least(90, coalesce(NEW.prep_days, 0) + coalesce((NEW.customisation->>'days')::integer, 0));
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Returns: customised pieces can't be returned or exchanged
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_return_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR coalesce(auth.role(), 'postgres') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT oi.product_title, oi.customisation IS NOT NULL AS customised, vo.id AS vendor_order_id, vo.status, vo.return_window_ends_on
    FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) AS e
    JOIN public.order_items oi ON oi.id::text = e->>'order_item_id'
    LEFT JOIN public.vendor_orders vo ON vo.id = oi.vendor_order_id
  LOOP
    IF r.customised THEN
      RAISE EXCEPTION '"%" was customised for you, so it can''t be returned or exchanged.', r.product_title
        USING ERRCODE = 'check_violation';
    END IF;
    -- Items not sold by a boutique have no delivery tracking to check.
    CONTINUE WHEN r.vendor_order_id IS NULL;
    IF r.status IS DISTINCT FROM 'delivered' THEN
      RAISE EXCEPTION '"%" hasn''t been delivered yet, so it can''t be returned or exchanged.', r.product_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF r.return_window_ends_on IS NOT NULL AND v_today > r.return_window_ends_on THEN
      RAISE EXCEPTION 'The return window for "%" closed on %.', r.product_title, to_char(r.return_window_ends_on, 'DD Mon YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Reference photos (private): the customer uploads to their own folder;
-- the boutique (and warehouse) of an order line that uses it, and admins,
-- can view it.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('customisation-photos', 'customisation-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

CREATE OR REPLACE FUNCTION public.can_view_customisation_photo(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.customisation->>'photo_path' = _path
      AND public.order_id_is_placed(oi.order_id)
      AND (public.is_vendor_member(auth.uid(), oi.vendor_id) OR public.can_operate_warehouse(auth.uid()))
  );
$$;

DROP POLICY IF EXISTS "Customers upload their own customisation photos" ON storage.objects;
CREATE POLICY "Customers upload their own customisation photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customisation-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Customers remove their own customisation photos" ON storage.objects;
CREATE POLICY "Customers remove their own customisation photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'customisation-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Customisation photos readable by customer, boutique, warehouse and admins" ON storage.objects;
CREATE POLICY "Customisation photos readable by customer, boutique, warehouse and admins"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'customisation-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR public.can_view_customisation_photo(name)
    )
  );

-- ===== [082/100] 20261016100000_payout_after_return_window.sql =====
-- Boutiques are paid only once the return/exchange window has closed.
-- Rule (user, 2026-10-16): a boutique order becomes payable only after its
-- return/exchange window has ended - for every boutique, no exceptions -
-- and never while a return/exchange on it is still open. Before this:
--   * a part with only "exchange-only" (non-refundable) items had no hold, so
--     it was paid 24 hours after delivery while an exchange could still come;
--   * an admin extending a part's window didn't move its payout date;
--   * the payout runs didn't re-check the window, and the Route release
--     missed several open return states (pickup scheduled, at the warehouse,
--     QC...).
-- The window is the part's return_window_ends_on (set on delivery, admins can
-- move it). A part made only of customised pieces has no window (they can't
-- be returned or exchanged) and keeps the 24-hour rule.

-- The last day of a part's return/exchange window, or NULL if it has none.
CREATE OR REPLACE FUNCTION public.vendor_order_window_end(_vendor_order_id uuid, _delivered_at timestamptz, _window_end date)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.order_items oi WHERE oi.vendor_order_id = _vendor_order_id AND oi.customisation IS NULL
    ) THEN NULL
    ELSE coalesce(
      _window_end,
      (coalesce(_delivered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date
        + coalesce((SELECT v.return_window_days FROM public.vendor_orders vo JOIN public.vendors v ON v.id = vo.vendor_id
                    WHERE vo.id = _vendor_order_id), 7))
  END;
$$;
REVOKE ALL ON FUNCTION public.vendor_order_window_end(uuid, timestamptz, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendor_order_window_end(uuid, timestamptz, date) TO authenticated, service_role;

-- Payout date: the first weekly payout day after the part is ready -
-- at least payout_hold_hours (24h) after delivery, after the end of its
-- return/exchange window, after Razorpay settled an online payment, and
-- after a COD order's cash reached AllBoutiqs.
CREATE OR REPLACE FUNCTION public.vendor_order_payout_date_for(_vendor_order_id uuid, _delivered_at timestamptz, _window_end date)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_rates := public.rates_on(now());
  v_order_id uuid;
  v_cod_at timestamptz;
  v_method text;
  v_paid_at timestamptz;
  v_settle integer;
  v_end date;
  v_ready timestamptz;
BEGIN
  SELECT order_id, cod_received_at INTO v_order_id, v_cod_at FROM public.vendor_orders WHERE id = _vendor_order_id;
  SELECT payment_method INTO v_method FROM public.orders WHERE id = v_order_id;
  SELECT payout_settlement_days INTO v_settle FROM public.platform_settings WHERE id;

  v_ready := _delivered_at + make_interval(hours => coalesce(r.payout_hold_hours, 24));

  -- Not before the return/exchange window's last day is over.
  v_end := public.vendor_order_window_end(_vendor_order_id, _delivered_at, _window_end);
  IF v_end IS NOT NULL THEN
    v_ready := greatest(v_ready, ((v_end + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'));
  END IF;

  IF v_method IS DISTINCT FROM 'cod' THEN
    SELECT min(created_at) INTO v_paid_at
    FROM public.payments
    WHERE order_id = v_order_id AND payment_status IN ('paid', 'partially_refunded', 'refunded');
    IF v_paid_at IS NOT NULL THEN
      v_ready := greatest(v_ready,
        (public.add_business_days((v_paid_at AT TIME ZONE 'Asia/Kolkata')::date, coalesce(v_settle, 2))::timestamp AT TIME ZONE 'Asia/Kolkata'));
    END IF;
  ELSIF v_cod_at IS NOT NULL THEN
    v_ready := greatest(v_ready, v_cod_at);
  END IF;

  RETURN public.next_payout_date(v_ready);
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_order_payout_date_for(uuid, timestamptz, date) FROM public, anon;

CREATE OR REPLACE FUNCTION public.vendor_order_payout_date(_vendor_order_id uuid, _delivered_at timestamptz)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.vendor_order_payout_date_for(_vendor_order_id, _delivered_at,
    (SELECT return_window_ends_on FROM public.vendor_orders WHERE id = _vendor_order_id));
$$;

-- Days the payout waits for the window (for messages): window end - delivery day.
CREATE OR REPLACE FUNCTION public.vendor_order_payout_hold_days(_vendor_order_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    public.vendor_order_window_end(vo.id, vo.delivered_at, vo.return_window_ends_on)
      - (coalesce(vo.delivered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date,
    0)
  FROM public.vendor_orders vo
  WHERE vo.id = _vendor_order_id;
$$;

-- On delivery: the window is set first (set_return_window_on_delivery runs
-- before this - triggers fire in name order), then the payout date from it.
CREATE OR REPLACE FUNCTION public.stamp_vendor_order_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := coalesce(NEW.delivered_at, now());
    NEW.payout_eligible_on := public.vendor_order_payout_date_for(NEW.id, NEW.delivered_at, NEW.return_window_ends_on);
    IF NEW.payout_eligible_on <= (NEW.delivered_at AT TIME ZONE 'Asia/Kolkata')::date THEN
      NEW.due_notified_at := coalesce(NEW.due_notified_at, now());
    END IF;
    IF OLD.payout_notified_at IS NULL THEN
      NEW.payout_notified_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- An admin moving a part's window moves its payout date too (unless it has
-- already been paid).
CREATE OR REPLACE FUNCTION public.reschedule_payout_on_window_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.return_window_ends_on IS DISTINCT FROM OLD.return_window_ends_on
     AND NEW.status = 'delivered' AND NEW.delivered_at IS NOT NULL
     AND NEW.payout_id IS NULL AND NEW.rzp_transfer_status IS DISTINCT FROM 'released' THEN
    NEW.payout_eligible_on := public.vendor_order_payout_date_for(NEW.id, NEW.delivered_at, NEW.return_window_ends_on);
    IF NEW.payout_eligible_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      NEW.due_notified_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reschedule_payout_on_window_change_trigger ON public.vendor_orders;
CREATE TRIGGER reschedule_payout_on_window_change_trigger
  BEFORE UPDATE OF return_window_ends_on ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.reschedule_payout_on_window_change();

-- Why a boutique order can't be paid right now - NULL when it can. Every
-- payout run (Razorpay Route release, RazorpayX, manual) checks this at the
-- moment of paying, not just the stored date.
CREATE OR REPLACE FUNCTION public.vendor_order_payout_blocker(_vendor_order_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vo public.vendor_orders;
  o public.orders;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_end date;
BEGIN
  SELECT * INTO vo FROM public.vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF vo.payout_id IS NOT NULL OR vo.rzp_transfer_status = 'released' THEN RETURN 'paid'; END IF;
  IF vo.status IS DISTINCT FROM 'delivered' THEN RETURN 'not_delivered'; END IF;

  v_end := public.vendor_order_window_end(vo.id, vo.delivered_at, vo.return_window_ends_on);
  IF v_end IS NOT NULL AND v_end >= v_today THEN RETURN 'return_window_open'; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.return_requests rr
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(rr.items, '[]'::jsonb)) e
    JOIN public.order_items oi ON oi.id::text = e->>'order_item_id'
    WHERE rr.order_id = vo.order_id AND oi.vendor_order_id = vo.id
      AND rr.status NOT IN ('rejected', 'completed', 'cancelled')
  ) THEN
    RETURN 'open_return';
  END IF;

  IF vo.payout_eligible_on IS NULL OR vo.payout_eligible_on > v_today THEN RETURN 'not_due'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = vo.order_id;
  IF o.payment_method = 'cod' THEN
    IF vo.cod_received_at IS NULL AND o.payment_status IS DISTINCT FROM 'paid' THEN RETURN 'cod_cash_pending'; END IF;
  ELSIF o.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN 'payment_pending';
  END IF;

  IF coalesce(vo.net_payable, 0) - coalesce(vo.rzp_reversed_amount, 0) <= 0 THEN RETURN 'nothing_to_pay'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_order_payout_blocker(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendor_order_payout_blocker(uuid) TO authenticated, service_role;

-- The same check for many parts at once (payout runs).
CREATE OR REPLACE FUNCTION public.vendor_order_payout_blockers(_vendor_order_ids uuid[])
RETURNS TABLE (vendor_order_id uuid, blocker text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, public.vendor_order_payout_blocker(id) FROM unnest(_vendor_order_ids) AS id;
$$;
REVOKE ALL ON FUNCTION public.vendor_order_payout_blockers(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_order_payout_blockers(uuid[]) TO service_role;

-- Parts delivered but not yet paid get their date under the new rule
-- (the flag lets this past protect_vendor_order_payout_fields).
SELECT set_config('app.vendor_order_fee_calc', 'on', true);
UPDATE public.vendor_orders vo
SET payout_eligible_on = public.vendor_order_payout_date_for(vo.id, vo.delivered_at, vo.return_window_ends_on)
WHERE vo.status = 'delivered' AND vo.delivered_at IS NOT NULL
  AND vo.payout_id IS NULL AND vo.rzp_transfer_status IS DISTINCT FROM 'released';
SELECT set_config('app.vendor_order_fee_calc', 'off', true);

-- ===== [083/100] 20261016110000_razorpayx_payouts.sql =====
-- Boutique payouts through RazorpayX (2026-10-16). Razorpay Route needs over
-- ₹40 lakh of AllBoutiqs' own turnover (RBI PA rules), so payments settle to
-- AllBoutiqs' RazorpayX current account and AllBoutiqs pays each boutique
-- every payout day with a RazorpayX payout (bank transfer), COD cash
-- included.
--   * A boutique's bank account becomes a RazorpayX contact + fund account
--     and is checked with a ₹1 deposit; the bank's account-holder name must
--     match (an admin can accept a mismatch).
--   * Each payout day the boutique orders that are ready (return/exchange
--     window closed, nothing open - vendor_order_payout_blocker) are batched
--     per boutique into vendor_payouts; an admin approves and sends them (or
--     they go automatically when payout_auto_send is on). Every order is
--     re-checked at the moment of sending.
--   * Razorpay tells us when each transfer is credited (UTR) or fails; a
--     failed transfer puts the orders back in the queue (existing triggers).
-- The manual way (pay outside, "Mark credited" with the UTR) still works.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS payout_rail text NOT NULL DEFAULT 'razorpayx'
    CHECK (payout_rail IN ('razorpayx', 'razorpay_route', 'manual')),
  -- false: an admin approves and sends each payout day's batch
  ADD COLUMN IF NOT EXISTS payout_auto_send boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Boutique bank accounts in RazorpayX
-- ---------------------------------------------------------------------------
ALTER TABLE public.vendor_payout_accounts
  ADD COLUMN IF NOT EXISTS rzpx_contact_id text,
  ADD COLUMN IF NOT EXISTS rzpx_fund_account_id text,
  ADD COLUMN IF NOT EXISTS rzpx_validation_id text,
  -- not_started | registered (in RazorpayX, not yet checked) | verifying |
  -- verified | name_mismatch | invalid | failed (couldn't reach RazorpayX)
  ADD COLUMN IF NOT EXISTS rzpx_status text NOT NULL DEFAULT 'not_started'
    CHECK (rzpx_status IN ('not_started', 'registered', 'verifying', 'verified', 'name_mismatch', 'invalid', 'failed')),
  ADD COLUMN IF NOT EXISTS rzpx_registered_name text,
  ADD COLUMN IF NOT EXISTS rzpx_error text,
  ADD COLUMN IF NOT EXISTS rzpx_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rzpx_name_approved_by uuid REFERENCES auth.users(id);

-- RazorpayX fields are written only by the server (and admins); changed
-- bank details start the check again with a new fund account.
CREATE OR REPLACE FUNCTION public.guard_payout_account_rzpx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_privileged_writer() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.rzpx_contact_id := NULL;
      NEW.rzpx_fund_account_id := NULL;
      NEW.rzpx_validation_id := NULL;
      NEW.rzpx_status := 'not_started';
      NEW.rzpx_registered_name := NULL;
      NEW.rzpx_error := NULL;
      NEW.rzpx_verified_at := NULL;
      NEW.rzpx_name_approved_by := NULL;
    ELSE
      NEW.rzpx_contact_id := OLD.rzpx_contact_id;
      NEW.rzpx_fund_account_id := OLD.rzpx_fund_account_id;
      NEW.rzpx_validation_id := OLD.rzpx_validation_id;
      NEW.rzpx_status := OLD.rzpx_status;
      NEW.rzpx_registered_name := OLD.rzpx_registered_name;
      NEW.rzpx_error := OLD.rzpx_error;
      NEW.rzpx_verified_at := OLD.rzpx_verified_at;
      NEW.rzpx_name_approved_by := OLD.rzpx_name_approved_by;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.bank_account_number IS DISTINCT FROM OLD.bank_account_number
    OR NEW.bank_ifsc IS DISTINCT FROM OLD.bank_ifsc
    OR NEW.account_holder_name IS DISTINCT FROM OLD.account_holder_name) THEN
    NEW.rzpx_fund_account_id := NULL;
    NEW.rzpx_validation_id := NULL;
    NEW.rzpx_status := CASE WHEN NEW.rzpx_contact_id IS NULL THEN 'not_started' ELSE 'registered' END;
    NEW.rzpx_registered_name := NULL;
    NEW.rzpx_error := NULL;
    NEW.rzpx_verified_at := NULL;
    NEW.rzpx_name_approved_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_payout_account_rzpx_trigger ON public.vendor_payout_accounts;
CREATE TRIGGER guard_payout_account_rzpx_trigger
  BEFORE INSERT OR UPDATE ON public.vendor_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_payout_account_rzpx();

-- ---------------------------------------------------------------------------
-- Payouts
-- ---------------------------------------------------------------------------
ALTER TABLE public.vendor_payouts
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'manual' CHECK (method IN ('manual', 'razorpayx')),
  ADD COLUMN IF NOT EXISTS payout_date date,
  ADD COLUMN IF NOT EXISTS rzpx_payout_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS rzpx_status text,
  ADD COLUMN IF NOT EXISTS rzpx_mode text,
  ADD COLUMN IF NOT EXISTS rzpx_fees numeric(12,2),
  ADD COLUMN IF NOT EXISTS rzpx_tax numeric(12,2),
  ADD COLUMN IF NOT EXISTS rzpx_error text,
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- A boutique order counts as paid once its transfer is on its way or done;
-- one sitting in a batch that hasn't been sent is re-checked when it is.
CREATE OR REPLACE FUNCTION public.vendor_order_payout_blocker(_vendor_order_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vo public.vendor_orders;
  o public.orders;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_end date;
BEGIN
  SELECT * INTO vo FROM public.vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF vo.rzp_transfer_status = 'released'
     OR EXISTS (SELECT 1 FROM public.vendor_payouts p WHERE p.id = vo.payout_id AND p.status IN ('processing', 'paid')) THEN
    RETURN 'paid';
  END IF;
  IF vo.status IS DISTINCT FROM 'delivered' THEN RETURN 'not_delivered'; END IF;

  v_end := public.vendor_order_window_end(vo.id, vo.delivered_at, vo.return_window_ends_on);
  IF v_end IS NOT NULL AND v_end >= v_today THEN RETURN 'return_window_open'; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.return_requests rr
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(rr.items, '[]'::jsonb)) e
    JOIN public.order_items oi ON oi.id::text = e->>'order_item_id'
    WHERE rr.order_id = vo.order_id AND oi.vendor_order_id = vo.id
      AND rr.status NOT IN ('rejected', 'completed', 'cancelled')
  ) THEN
    RETURN 'open_return';
  END IF;

  IF vo.payout_eligible_on IS NULL OR vo.payout_eligible_on > v_today THEN RETURN 'not_due'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = vo.order_id;
  IF o.payment_method = 'cod' THEN
    IF vo.cod_received_at IS NULL AND o.payment_status IS DISTINCT FROM 'paid' THEN RETURN 'cod_cash_pending'; END IF;
  ELSIF o.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN 'payment_pending';
  END IF;

  IF coalesce(vo.net_payable, 0) - coalesce(vo.rzp_reversed_amount, 0) <= 0 THEN RETURN 'nothing_to_pay'; END IF;
  RETURN NULL;
END;
$$;

-- Payout day batch: every ready boutique order not yet in a batch, one
-- pending payout per boutique (added to that boutique's unsent batch for the
-- day if there is one). Boutiques with no usable bank account keep their
-- money queued. Returns what it did, per boutique.
CREATE OR REPLACE FUNCTION public.prepare_vendor_payouts(_payout_date date DEFAULT NULL)
RETURNS TABLE (vendor_id uuid, vendor_name text, payout_id uuid, order_count integer, net_payable numeric, skipped_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := coalesce(_payout_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  r record;
  v_payout uuid;
  v_status text;
  v_has_account boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only AllBoutiqs admins can prepare payouts';
  END IF;

  FOR r IN
    SELECT vo.vendor_id AS vid, v.name AS vname, array_agg(vo.id) AS ids,
           sum(vo.net_payable - coalesce(vo.rzp_reversed_amount, 0)) AS amount,
           sum(vo.subtotal + coalesce(vo.shipping_cost, 0)) AS gross,
           sum(vo.commission_amount) AS commission,
           min((vo.delivered_at AT TIME ZONE 'Asia/Kolkata')::date) AS first_day
    FROM public.vendor_orders vo
    JOIN public.vendors v ON v.id = vo.vendor_id
    WHERE vo.payout_id IS NULL
      AND vo.status = 'delivered'
      AND vo.rzp_transfer_status IS DISTINCT FROM 'released'
      AND public.vendor_order_payout_blocker(vo.id) IS NULL
    GROUP BY vo.vendor_id, v.name
  LOOP
    SELECT payout_account_status INTO v_status FROM public.vendors WHERE id = r.vid;
    v_has_account := EXISTS (SELECT 1 FROM public.vendor_payout_accounts a WHERE a.vendor_id = r.vid);
    IF NOT v_has_account OR v_status IN ('not_setup', 'needs_update', 'disabled') THEN
      vendor_id := r.vid; vendor_name := r.vname; payout_id := NULL; order_count := array_length(r.ids, 1);
      net_payable := r.amount;
      skipped_reason := CASE WHEN v_status = 'disabled' THEN 'payouts disabled'
                             WHEN v_status = 'needs_update' THEN 'bank details need updating'
                             ELSE 'no payout bank account' END;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT p.id INTO v_payout FROM public.vendor_payouts p
    WHERE p.vendor_id = r.vid AND p.status = 'pending' AND p.payout_date = v_day
    LIMIT 1;
    IF v_payout IS NULL THEN
      INSERT INTO public.vendor_payouts (vendor_id, period_start, period_end, payout_date, gross_sales, commission_amount,
                                         net_payable, order_count, vendor_order_ids)
      VALUES (r.vid, coalesce(r.first_day, v_day), v_day, v_day, r.gross, r.commission, r.amount, array_length(r.ids, 1), r.ids)
      RETURNING id INTO v_payout;
    ELSE
      UPDATE public.vendor_payouts p SET
        gross_sales = p.gross_sales + r.gross,
        commission_amount = p.commission_amount + r.commission,
        net_payable = p.net_payable + r.amount,
        order_count = p.order_count + array_length(r.ids, 1),
        vendor_order_ids = p.vendor_order_ids || r.ids,
        period_start = least(p.period_start, coalesce(r.first_day, v_day))
      WHERE p.id = v_payout;
    END IF;

    PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
    UPDATE public.vendor_orders SET payout_id = v_payout WHERE id = ANY (r.ids);
    PERFORM set_config('app.vendor_order_fee_calc', 'off', true);

    vendor_id := r.vid; vendor_name := r.vname; payout_id := v_payout; order_count := array_length(r.ids, 1);
    net_payable := r.amount; skipped_reason := NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_vendor_payouts(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.prepare_vendor_payouts(date) TO authenticated, service_role;

-- Just before sending: take out any order that isn't payable any more (a
-- return opened, the window was extended...) and re-total the batch.
-- Returns the amount still to send (0 = nothing; the batch is removed).
CREATE OR REPLACE FUNCTION public.recheck_vendor_payout(_payout_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.vendor_payouts;
  v_drop uuid[];
  v_keep uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only AllBoutiqs admins can send payouts';
  END IF;
  SELECT * INTO p FROM public.vendor_payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'pending' THEN RETURN 0; END IF;

  SELECT array_agg(id) FILTER (WHERE public.vendor_order_payout_blocker(id) IS NOT NULL),
         array_agg(id) FILTER (WHERE public.vendor_order_payout_blocker(id) IS NULL)
  INTO v_drop, v_keep
  FROM public.vendor_orders WHERE payout_id = _payout_id;

  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  IF v_drop IS NOT NULL THEN
    UPDATE public.vendor_orders SET payout_id = NULL WHERE id = ANY (v_drop);
  END IF;
  PERFORM set_config('app.vendor_order_fee_calc', 'off', true);

  IF v_keep IS NULL THEN
    DELETE FROM public.vendor_payouts WHERE id = _payout_id;
    RETURN 0;
  END IF;

  UPDATE public.vendor_payouts x SET
    order_count = array_length(v_keep, 1),
    vendor_order_ids = v_keep,
    gross_sales = (SELECT sum(subtotal + coalesce(shipping_cost, 0)) FROM public.vendor_orders WHERE id = ANY (v_keep)),
    commission_amount = (SELECT sum(commission_amount) FROM public.vendor_orders WHERE id = ANY (v_keep)),
    net_payable = (SELECT sum(net_payable - coalesce(rzp_reversed_amount, 0)) FROM public.vendor_orders WHERE id = ANY (v_keep))
  WHERE x.id = _payout_id
  RETURNING x.net_payable INTO p.net_payable;
  RETURN p.net_payable;
END;
$$;
REVOKE ALL ON FUNCTION public.recheck_vendor_payout(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recheck_vendor_payout(uuid) TO authenticated, service_role;

-- Boutique messages: "processing" when the transfer is actually sent (a
-- batch waiting for approval isn't a transfer yet); credited/failed as before.
CREATE OR REPLACE FUNCTION public.vendor_payout_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acct text := coalesce(' ending ' || NEW.bank_account_last4, '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'processing' THEN
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_processing', 'Payout processing',
      format('We''ve started the bank transfer of %s for %s order(s) to your account%s.',
             public.inr(NEW.net_payable), NEW.order_count, v_acct));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'processing', 'payout_id', NEW.id));
  ELSIF NEW.status = 'paid' THEN
    UPDATE public.vendors SET payout_account_status = 'active'
    WHERE id = NEW.vendor_id AND payout_account_status IN ('pending', 'needs_update');
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_credited', 'Payout credited',
      format('%s was credited to your account%s. Bank reference (UTR): %s.',
             public.inr(NEW.net_payable), v_acct, NEW.payment_reference));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'credited', 'payout_id', NEW.id));
  ELSIF NEW.status = 'failed' THEN
    -- The money is still owed: put the orders back in the queue (already
    -- told, so the daily "queued" alert doesn't repeat) for the next run.
    PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
    UPDATE public.vendor_orders
    SET payout_id = NULL, due_notified_at = coalesce(due_notified_at, now())
    WHERE payout_id = NEW.id;
    PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
    UPDATE public.vendors SET payout_account_status = 'needs_update', payout_reminder_sent_at = now()
    WHERE id = NEW.vendor_id AND payout_account_status <> 'disabled';
    PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_failed', 'Bank declined your payout',
      format('Your bank declined the transfer of %s (%s). The money is safe in your payout queue - update your bank details and we''ll send it in the next payout run.',
             public.inr(NEW.net_payable), NEW.failure_reason));
    PERFORM public.invoke_edge_function('send-vendor-payout-email',
      jsonb_build_object('event', 'failed', 'payout_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Schedule: payout day, 09:30 IST (after the cut-off; before the old 10:00
-- Route run, which now only runs when the rail is Route).
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'razorpayx-payout-day';
SELECT cron.schedule('razorpayx-payout-day', '0 4 * * *',
  $$SELECT public.invoke_edge_function('razorpayx-payouts', '{"action":"payout_day"}'::jsonb);$$);

-- ===== [084/100] 20261016120000_payout_batch_uniqueness.sql =====
-- A boutique could only ever have one payout per period_start (left over
-- from the old period-based manual runs). With payout-day batches that
-- blocked real cases - a declined payout's orders going out again in a
-- later batch, or two batches whose earliest delivery falls on the same
-- day - and the money stayed stuck. Double payment is already prevented by
-- each order's link to its batch (vendor_orders.payout_id); what must stay
-- unique is one unsent batch per boutique per payout day.
ALTER TABLE public.vendor_payouts DROP CONSTRAINT IF EXISTS vendor_payouts_vendor_id_period_start_key;
CREATE UNIQUE INDEX IF NOT EXISTS vendor_payouts_one_pending_per_day
  ON public.vendor_payouts (vendor_id, payout_date) WHERE status = 'pending';

-- ===== [085/100] 20261016130000_size_charts.sql =====
-- Size charts (2026-10-16). AllBoutiqs fixes one template per category -
-- which measurements (rows) and which sizes (columns) - and each boutique
-- fills in only the numbers for its own products in that category. No
-- approval: a boutique's chart shows on its product pages as soon as it's
-- saved. Inches throughout.
--
-- size_guides (unused until now) becomes the category template:
--   sizes        ["XS","S",...]
--   measurements [{key, name, hint, values}]  - key stays fixed if renamed;
--                values = optional AllBoutiqs standard numbers per size.
-- vendor_size_charts holds a boutique's numbers: values {measurementKey: {size: "34"}}.

ALTER TABLE public.size_guides
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'in' CHECK (unit IN ('in', 'cm'));
CREATE UNIQUE INDEX IF NOT EXISTS size_guides_one_per_category ON public.size_guides (category_id) WHERE category_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vendor_size_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  values jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(values) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, category_id)
);
ALTER TABLE public.vendor_size_charts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view size charts" ON public.vendor_size_charts FOR SELECT USING (true);
CREATE POLICY "Boutiques manage their own size charts" ON public.vendor_size_charts FOR ALL TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS update_vendor_size_charts_updated_at ON public.vendor_size_charts;
CREATE TRIGGER update_vendor_size_charts_updated_at
  BEFORE UPDATE ON public.vendor_size_charts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Starting templates for the current categories (admins can change them).
WITH t(slug, name, measurements) AS (
  VALUES
  ('kurti', 'Kurti', '[
    {"key":"bust","name":"Bust","hint":"Around the fullest part of the chest, tape level","values":{}},
    {"key":"waist","name":"Waist","hint":"Around the natural waist, the narrowest part","values":{}},
    {"key":"hip","name":"Hip","hint":"Around the fullest part of the hips","values":{}},
    {"key":"shoulder","name":"Shoulder","hint":"Across the back, from one shoulder edge to the other","values":{}},
    {"key":"sleeve_length","name":"Sleeve length","hint":"From the shoulder edge down to where the sleeve should end","values":{}},
    {"key":"length","name":"Kurti length","hint":"From the highest point of the shoulder down to the hem","values":{}}
  ]'::jsonb),
  ('lehenga', 'Lehenga', '[
    {"key":"bust","name":"Bust","hint":"Around the fullest part of the chest, tape level","values":{}},
    {"key":"waist","name":"Waist","hint":"Around the natural waist, the narrowest part","values":{}},
    {"key":"hip","name":"Hip","hint":"Around the fullest part of the hips","values":{}},
    {"key":"shoulder","name":"Shoulder","hint":"Across the back, from one shoulder edge to the other","values":{}},
    {"key":"blouse_length","name":"Blouse length","hint":"From the highest point of the shoulder down to where the blouse should end","values":{}},
    {"key":"skirt_waist","name":"Skirt waist","hint":"Around the waist where the lehenga will sit","values":{}},
    {"key":"skirt_length","name":"Skirt length","hint":"From where the lehenga sits on the waist down to the floor, with footwear","values":{}}
  ]'::jsonb),
  ('sarees', 'Saree blouse', '[
    {"key":"bust","name":"Bust","hint":"Around the fullest part of the chest, tape level","values":{}},
    {"key":"under_bust","name":"Under-bust","hint":"Around the ribcage just below the bust","values":{}},
    {"key":"waist","name":"Waist","hint":"Around the natural waist, the narrowest part","values":{}},
    {"key":"shoulder","name":"Shoulder","hint":"Across the back, from one shoulder edge to the other","values":{}},
    {"key":"armhole","name":"Armhole","hint":"Around the arm at the shoulder joint","values":{}},
    {"key":"sleeve_length","name":"Sleeve length","hint":"From the shoulder edge down to where the sleeve should end","values":{}},
    {"key":"blouse_length","name":"Blouse length","hint":"From the highest point of the shoulder down to where the blouse should end","values":{}}
  ]'::jsonb),
  ('western-wear', 'Western wear', '[
    {"key":"bust","name":"Bust","hint":"Around the fullest part of the chest, tape level","values":{}},
    {"key":"waist","name":"Waist","hint":"Around the natural waist, the narrowest part","values":{}},
    {"key":"hip","name":"Hip","hint":"Around the fullest part of the hips","values":{}},
    {"key":"shoulder","name":"Shoulder","hint":"Across the back, from one shoulder edge to the other","values":{}},
    {"key":"length","name":"Length","hint":"From the highest point of the shoulder down to the hem","values":{}}
  ]'::jsonb)
)
INSERT INTO public.size_guides (category_id, name, sizes, measurements, unit)
SELECT c.id, t.name, '["XS","S","M","L","XL","XXL"]'::jsonb, t.measurements, 'in'
FROM t JOIN public.categories c ON c.slug = t.slug
WHERE NOT EXISTS (SELECT 1 FROM public.size_guides g WHERE g.category_id = c.id);

-- ===== [086/100] 20261016140000_pause_razorpayx.sql =====
-- RazorpayX payouts paused until the client's RazorpayX account is active and
-- its account number is set (user, 2026-10-16). With the rail on 'manual'
-- the daily payout-day job does nothing and bank accounts aren't registered
-- with RazorpayX; admins prepare payouts, pay by hand and "Mark credited".
-- The return/exchange-window rule (vendor_order_payout_blocker) still
-- applies to every payout. Turn back on: payout_rail = 'razorpayx'.
UPDATE public.platform_settings SET payout_rail = 'manual' WHERE id;

-- ===== [087/100] 20261024100000_seller_form_part7.sql =====
-- Seller registration form, Developer Corrections Part 7 (2.2-2.7, 3.1-3.3):
-- HUF as a fifth business type, ROF certificate optional for partnerships,
-- Instagram profile link (required) and website (optional), brand name vs
-- legal business name with a declaration, and real checks on the address
-- (line 1 of 10+ characters, city, state, 6-digit PIN) and mobile numbers
-- (a leading 0 is dropped).

-- ---------- columns ----------

ALTER TABLE public.vendor_kyc
  ADD COLUMN IF NOT EXISTS brand_same_as_legal boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS brand_legal_declared_at timestamptz,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS website_url text;

COMMENT ON COLUMN public.vendor_kyc.brand_same_as_legal IS
  'false when the boutique / brand name (vendors.name) differs from legal_business_name';
COMMENT ON COLUMN public.vendor_kyc.brand_legal_declared_at IS
  'When the applicant ticked that the brand operates under / belongs to the legal business';

-- Boutiques that applied before the choice existed.
UPDATE public.vendor_kyc k
SET brand_same_as_legal =
  lower(regexp_replace(v.name, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(k.legal_business_name, '[^a-zA-Z0-9]', '', 'g'))
FROM public.vendors v
WHERE v.id = k.vendor_id;

ALTER TABLE public.vendor_kyc DROP CONSTRAINT IF EXISTS vendor_kyc_business_constitution_check;
ALTER TABLE public.vendor_kyc ADD CONSTRAINT vendor_kyc_business_constitution_check
  CHECK (business_constitution IN ('proprietorship', 'partnership', 'llp', 'private_limited', 'huf'));

ALTER TABLE public.vendor_payout_accounts DROP CONSTRAINT IF EXISTS vendor_payout_accounts_business_type_check;
ALTER TABLE public.vendor_payout_accounts ADD CONSTRAINT vendor_payout_accounts_business_type_check
  CHECK (business_type IN ('individual', 'proprietorship', 'partnership', 'private_limited', 'llp', 'huf'));

-- ---------- checklist (mirrors src/lib/vendorKyc.ts) ----------

CREATE OR REPLACE FUNCTION public.vendor_required_documents(_constitution text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _constitution
    WHEN 'proprietorship' THEN ARRAY['gst_certificate', 'pan_card', 'aadhaar_card']
    WHEN 'partnership' THEN ARRAY['gst_certificate', 'pan_card', 'aadhaar_card', 'partnership_deed']
    WHEN 'llp' THEN ARRAY['gst_certificate', 'pan_card', 'aadhaar_card', 'llp_incorporation']
    WHEN 'private_limited' THEN ARRAY['gst_certificate', 'pan_card', 'aadhaar_card', 'company_incorporation']
    WHEN 'huf' THEN ARRAY['pan_card', 'gst_certificate', 'aadhaar_card']
  END || ARRAY['bank_proof'];
$$;

CREATE OR REPLACE FUNCTION public.vendor_optional_documents(_constitution text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _constitution
    WHEN 'proprietorship' THEN ARRAY['msme_certificate']
    WHEN 'partnership' THEN ARRAY['rof_certificate']
    WHEN 'huf' THEN ARRAY['msme_certificate']
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_document_label(_doc_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _doc_type
    WHEN 'pan_card' THEN 'PAN card'
    WHEN 'aadhaar_card' THEN 'Aadhaar card'
    WHEN 'gst_certificate' THEN 'GST registration certificate'
    WHEN 'msme_certificate' THEN 'MSME / Udyam certificate'
    WHEN 'partnership_deed' THEN 'Partnership deed'
    WHEN 'rof_certificate' THEN 'Registration of Firm (ROF) certificate'
    WHEN 'llp_incorporation' THEN 'Certificate of Incorporation'
    WHEN 'company_incorporation' THEN 'Certificate of Incorporation'
    WHEN 'bank_proof' THEN 'Bank proof'
    ELSE _doc_type
  END;
$$;

-- ---------- field rules (mirror src/lib/vendorKyc.ts) ----------

-- 10-digit Indian mobile, or NULL. Accepts +91 / 91 in front of a longer
-- number, spaces, and drops leading zeros (a leading 0 stops the call).
CREATE OR REPLACE FUNCTION public.normalize_indian_mobile(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN d ~ '^[6-9][0-9]{9}$' THEN d END
  FROM (
    SELECT ltrim(CASE WHEN length(x) > 10 AND x LIKE '91%' THEN substr(x, 3) ELSE x END, '0') AS d
    FROM (SELECT regexp_replace(coalesce(_raw, ''), '[^0-9]', '', 'g') AS x) s
  ) t;
$$;

-- An Instagram profile link as https://www.instagram.com/<username>, or
-- NULL for anything else (emails, bare usernames, post / reel / story
-- links). Share links' "?igsh=..." is dropped.
CREATE OR REPLACE FUNCTION public.normalize_instagram_profile(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN m IS NOT NULL
      AND lower(m[1]) <> ALL (ARRAY['p', 'reel', 'reels', 'stories', 'explore', 'tv', 'accounts', 'direct', 'about', 'legal', 'developer', 'web', 'share'])
    THEN 'https://www.instagram.com/' || lower(m[1])
  END
  FROM (
    SELECT regexp_match(btrim(coalesce(_raw, '')), '^(?:https?://)?(?:www\.|m\.)?instagram\.com/([A-Za-z0-9._]{1,30})/?(?:\?\S*)?$', 'i') AS m
  ) s;
$$;

-- A website link with https:// added when missing, or NULL.
CREATE OR REPLACE FUNCTION public.normalize_website_url(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN length(x) <= 300 AND x ~* '^https?://[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?(/\S*)?$' THEN x END
  FROM (
    SELECT CASE WHEN btrim(coalesce(_raw, '')) ~* '^https?://' THEN btrim(_raw) ELSE 'https://' || btrim(coalesce(_raw, '')) END AS x
  ) s;
$$;

-- ---------- submit ----------

CREATE OR REPLACE FUNCTION public.submit_vendor_application(_app jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email_re text := '^[^\s@]+@[^\s@]+\.[^\s@]+$';
  v_name text := btrim(coalesce(_app->>'name', ''));
  v_constitution text := _app->>'business_constitution';
  v_brand_same boolean := coalesce((_app->>'brand_same_as_legal')::boolean, true);
  v_declared boolean := coalesce((_app->>'brand_legal_declaration')::boolean, false);
  v_legal text := btrim(coalesce(_app->>'legal_business_name', ''));
  v_instagram text := public.normalize_instagram_profile(_app->>'instagram_url');
  v_website_raw text := btrim(coalesce(_app->>'website_url', ''));
  v_website text;
  v_addr jsonb := coalesce(_app->'address', '{}'::jsonb);
  v_line1 text := btrim(coalesce(v_addr->>'address_line1', ''));
  v_city text := btrim(coalesce(v_addr->>'city', ''));
  v_state text := btrim(coalesce(v_addr->>'state', ''));
  v_pin text := btrim(coalesce(v_addr->>'pincode', ''));
  v_pan text := upper(btrim(coalesce(_app->>'pan', '')));
  v_gstin text := upper(btrim(coalesce(_app->>'gstin', '')));
  v_primary text := public.normalize_indian_mobile(_app->>'primary_mobile');
  v_alternate text := public.normalize_indian_mobile(_app->>'alternate_mobile');
  v_business_email text := lower(btrim(coalesce(_app->>'business_email', '')));
  v_auth jsonb := coalesce(_app->'authorized_person', '{}'::jsonb);
  v_auth_mobile text := public.normalize_indian_mobile(v_auth->>'mobile');
  v_same boolean := coalesce((_app->>'contact_same_as_authorized')::boolean, true);
  v_contact jsonb := coalesce(_app->'contact_person', '{}'::jsonb);
  v_contact_mobile text := public.normalize_indian_mobile(v_contact->>'mobile');
  v_bank jsonb := coalesce(_app->'bank', '{}'::jsonb);
  v_account text := regexp_replace(coalesce(v_bank->>'account_number', ''), '\s', '', 'g');
  v_ifsc text := upper(btrim(coalesce(v_bank->>'ifsc', '')));
  v_docs jsonb := coalesce(_app->'documents', '[]'::jsonb);
  v_doc jsonb;
  v_types text[] := ARRAY[]::text[];
  v_allowed text[];
  v_missing text[];
  v_base text;
  v_slug text;
  v_try integer := 0;
  v_vendor_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to apply.';
  END IF;
  IF EXISTS (SELECT 1 FROM vendor_members WHERE user_id = v_uid)
     OR EXISTS (SELECT 1 FROM vendors WHERE owner_user_id = v_uid) THEN
    RAISE EXCEPTION 'You already have a store application.';
  END IF;

  IF v_name = '' THEN RAISE EXCEPTION 'Enter your Boutique / Brand Name.'; END IF;
  IF v_brand_same THEN
    v_legal := v_name;
  ELSE
    IF v_legal = '' THEN RAISE EXCEPTION 'Enter your Legal Business Name (as on GST / PAN).'; END IF;
    IF NOT v_declared THEN
      RAISE EXCEPTION 'Tick the declaration that your Boutique / Brand Name belongs to your Legal Business Name.';
    END IF;
  END IF;
  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Enter your Instagram profile link (e.g. https://www.instagram.com/yourboutique).';
  END IF;
  IF v_website_raw <> '' THEN
    v_website := public.normalize_website_url(v_website_raw);
    IF v_website IS NULL THEN RAISE EXCEPTION 'Enter a valid website link, or leave it empty.'; END IF;
  END IF;
  IF v_constitution IS NULL OR v_constitution NOT IN ('proprietorship', 'partnership', 'llp', 'private_limited', 'huf') THEN
    RAISE EXCEPTION 'Select your business type.';
  END IF;
  IF v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN RAISE EXCEPTION 'Enter a valid PAN (e.g. ABCDE1234F).'; END IF;
  IF v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RAISE EXCEPTION 'Enter a valid 15-character GST number.';
  END IF;
  IF substr(v_gstin, 3, 10) <> v_pan THEN
    RAISE EXCEPTION 'The GST number doesn''t match the PAN (characters 3 to 12 of a GST number are the PAN).';
  END IF;
  IF v_primary IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit primary mobile number.'; END IF;
  IF v_alternate IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit alternative mobile number.'; END IF;
  IF v_alternate = v_primary THEN
    RAISE EXCEPTION 'The alternative mobile number must be different from the primary one.';
  END IF;
  IF v_business_email !~ v_email_re THEN RAISE EXCEPTION 'Enter a valid official business email address.'; END IF;

  IF btrim(coalesce(v_auth->>'name', '')) = '' THEN RAISE EXCEPTION 'Enter the authorized person''s full name.'; END IF;
  IF btrim(coalesce(v_auth->>'designation', '')) = '' THEN RAISE EXCEPTION 'Enter the authorized person''s designation.'; END IF;
  IF v_auth_mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit mobile number for the authorized person.'; END IF;
  IF lower(btrim(coalesce(v_auth->>'email', ''))) !~ v_email_re THEN
    RAISE EXCEPTION 'Enter a valid email for the authorized person.';
  END IF;
  IF NOT v_same THEN
    IF btrim(coalesce(v_contact->>'name', '')) = '' OR btrim(coalesce(v_contact->>'designation', '')) = '' THEN
      RAISE EXCEPTION 'Enter the contact person''s name and designation.';
    END IF;
    IF v_contact_mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit mobile number for the contact person.'; END IF;
    IF lower(btrim(coalesce(v_contact->>'email', ''))) !~ v_email_re THEN
      RAISE EXCEPTION 'Enter a valid email for the contact person.';
    END IF;
  END IF;

  IF btrim(coalesce(v_bank->>'account_holder_name', '')) = '' THEN RAISE EXCEPTION 'Enter the bank account holder name.'; END IF;
  IF v_account !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Enter a valid bank account number (9 to 18 digits).'; END IF;
  IF v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Enter a valid 11-character IFSC code.'; END IF;
  IF btrim(coalesce(v_bank->>'bank_name', '')) = '' THEN RAISE EXCEPTION 'Enter the bank name.'; END IF;
  IF coalesce(v_bank->>'proof_type', '') NOT IN ('cancelled_cheque', 'bank_letter', 'bank_statement') THEN
    RAISE EXCEPTION 'Choose the type of bank proof you are uploading.';
  END IF;

  -- Business address = courier pickup address (Shiprocket rejects short
  -- address lines).
  IF length(v_line1) < 10 THEN RAISE EXCEPTION 'Address line 1 needs at least 10 characters.'; END IF;
  IF v_city = '' THEN RAISE EXCEPTION 'Enter your city.'; END IF;
  IF v_state = '' THEN RAISE EXCEPTION 'Select your state.'; END IF;
  IF v_pin !~ '^[1-9][0-9]{5}$' THEN RAISE EXCEPTION 'Enter a valid 6-digit PIN code.'; END IF;

  -- Documents: only this business type's, each a PDF this applicant
  -- uploaded to their own folder.
  v_allowed := public.vendor_required_documents(v_constitution) || public.vendor_optional_documents(v_constitution);
  FOR v_doc IN SELECT * FROM jsonb_array_elements(v_docs) LOOP
    IF NOT (v_doc->>'doc_type' = ANY (v_allowed)) THEN
      RAISE EXCEPTION '% isn''t needed for this business type.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    IF v_doc->>'doc_type' = ANY (v_types) THEN
      RAISE EXCEPTION 'Upload only one %.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    IF coalesce(v_doc->>'file_path', '') NOT LIKE v_uid::text || '/%'
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id = 'vendor-documents' AND o.name = v_doc->>'file_path'
           AND o.metadata->>'mimetype' = 'application/pdf'
       ) THEN
      RAISE EXCEPTION 'The % upload wasn''t found - please upload it again as a PDF.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    v_types := v_types || (v_doc->>'doc_type');
  END LOOP;
  SELECT array_agg(public.vendor_document_label(t)) INTO v_missing
  FROM unnest(public.vendor_required_documents(v_constitution)) AS t
  WHERE NOT (t = ANY (v_types));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Please upload: %.', array_to_string(v_missing, ', ');
  END IF;

  -- Unique storefront slug.
  v_base := nullif(trim(BOTH '-' FROM regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), '');
  v_base := coalesce(v_base, 'store-' || substr(md5(random()::text), 1, 6));
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM vendors WHERE slug = v_slug) LOOP
    v_try := v_try + 1;
    v_slug := v_base || '-' || v_try;
  END LOOP;

  INSERT INTO vendors (
    owner_user_id, name, slug, description, contact_email, contact_phone, gst_number, address,
    shipping_flat_rate, free_shipping_threshold, return_window_days, return_policy,
    status, commission_rate, payout_account_status, rating
  ) VALUES (
    v_uid, v_name, v_slug, nullif(btrim(coalesce(_app->>'description', '')), ''), v_business_email, v_primary, v_gstin,
    jsonb_build_object(
      'address_line1', v_line1,
      'address_line2', btrim(coalesce(v_addr->>'address_line2', '')),
      'city', v_city,
      'state', v_state,
      'pincode', v_pin,
      'country', 'India'
    ),
    coalesce((_app->>'shipping_flat_rate')::numeric, 0),
    nullif(_app->>'free_shipping_threshold', '')::numeric,
    coalesce((_app->>'return_window_days')::integer, 7),
    nullif(btrim(coalesce(_app->>'return_policy', '')), ''),
    'pending', 10, 'not_setup', 0
  )
  RETURNING id INTO v_vendor_id;

  INSERT INTO vendor_members (user_id, vendor_id, role) VALUES (v_uid, v_vendor_id, 'owner');

  INSERT INTO vendor_kyc (
    vendor_id, business_constitution, legal_business_name, pan, gstin, primary_mobile, alternate_mobile,
    business_email, authorized_name, authorized_designation, authorized_mobile, authorized_email,
    contact_same_as_authorized, contact_name, contact_designation, contact_mobile, contact_email, bank_proof_type,
    brand_same_as_legal, brand_legal_declared_at, instagram_url, website_url
  ) VALUES (
    v_vendor_id, v_constitution, v_legal, v_pan, v_gstin, v_primary, v_alternate,
    v_business_email, btrim(v_auth->>'name'), btrim(v_auth->>'designation'), v_auth_mobile, lower(btrim(v_auth->>'email')),
    v_same,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'name') END,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'designation') END,
    CASE WHEN v_same THEN NULL ELSE v_contact_mobile END,
    CASE WHEN v_same THEN NULL ELSE lower(btrim(v_contact->>'email')) END,
    v_bank->>'proof_type',
    v_brand_same, CASE WHEN v_brand_same THEN NULL ELSE now() END, v_instagram, v_website
  );

  INSERT INTO vendor_documents (vendor_id, doc_type, file_path, file_name, file_size, uploaded_by)
  SELECT v_vendor_id, d->>'doc_type', d->>'file_path', coalesce(nullif(d->>'file_name', ''), 'document.pdf'),
         nullif(d->>'file_size', '')::integer, v_uid
  FROM jsonb_array_elements(v_docs) AS d;

  -- Same table the Payouts tab and Razorpay onboarding use.
  INSERT INTO vendor_payout_accounts (
    vendor_id, account_holder_name, bank_account_number, bank_ifsc, bank_name, business_type, pan, legal_business_name
  ) VALUES (
    v_vendor_id, btrim(v_bank->>'account_holder_name'), v_account, v_ifsc, btrim(v_bank->>'bank_name'),
    v_constitution, v_pan, v_legal
  );

  PERFORM public.notify_admins('other', 'vendor_application', 'New boutique application',
    format('%s (%s) applied to sell on AllBoutiqs.', v_name,
           replace(replace(initcap(replace(v_constitution, '_', ' ')), 'Llp', 'LLP'), 'Huf', 'HUF')),
    '/admin?tab=vendors&sub=applications');

  RETURN v_vendor_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_vendor_application(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application(jsonb) TO authenticated;

-- ===== [088/100] 20261024110000_vendor_pan_from_kyc.sql =====
-- Admin vendor details read vendors.pan_number, but the seller registration
-- form only saved the PAN in vendor_kyc - so a newly registered boutique's
-- PAN showed empty (Developer Corrections Part 7, 7.2). Copy it across on
-- registration (never over a PAN an admin already typed) and fill in the
-- boutiques that registered before this.

CREATE OR REPLACE FUNCTION public.copy_kyc_pan_to_vendor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.vendors
  SET pan_number = NEW.pan
  WHERE id = NEW.vendor_id AND (pan_number IS NULL OR btrim(pan_number) = '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_kyc_copy_pan ON public.vendor_kyc;
CREATE TRIGGER vendor_kyc_copy_pan
  AFTER INSERT OR UPDATE OF pan ON public.vendor_kyc
  FOR EACH ROW EXECUTE FUNCTION public.copy_kyc_pan_to_vendor();

UPDATE public.vendors v
SET pan_number = k.pan
FROM public.vendor_kyc k
WHERE k.vendor_id = v.id AND (v.pan_number IS NULL OR btrim(v.pan_number) = '');

-- ===== [089/100] 20261024120000_warehouse_reads_products.sql =====
-- Warehouse staff pre-fill the customer parcel's weight and size from the
-- boutiques' product entries (Developer Corrections Part 7, 8.2). They could
-- only read products that are live on the store, so a piece hidden or
-- unpublished after it was ordered fell back to default numbers.
DROP POLICY IF EXISTS "Warehouse reads products" ON public.products;
CREATE POLICY "Warehouse reads products"
  ON public.products FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));

-- ===== [090/100] 20261024130000_product_value_excl_gst.sql =====
-- Product Value (Developer Corrections Part 7, 5.1): what a boutique enters
-- is its Product Value EXCLUDING GST. The customer's price (MRP) = Product
-- Value + GST, GST taken on the Product Value at the category's HSN rate
-- (apparel: 5% up to the HSN price limit, the higher rate above it).
--
-- products.price / product_variants.price stay the customer's price, so the
-- storefront, bag, checkout, orders and invoices (which take GST back out
-- of the price with gst_rate_for) keep working unchanged. The new
-- product_value / compare_at_value columns hold what the boutique typed;
-- triggers keep the two in step whoever writes:
--   * a writer that sends product_value gets price worked out from it;
--   * an older writer that only sends price gets product_value worked back.
-- All 44 existing products' prices are taken as Product Values (the user's
-- decision), so their customer prices go up by GST.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_value numeric(12, 2),
  ADD COLUMN IF NOT EXISTS compare_at_value numeric(12, 2);
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS product_value numeric(12, 2);

COMMENT ON COLUMN public.products.product_value IS 'Product Value excl. GST, as the boutique entered it; price = this + GST';
COMMENT ON COLUMN public.products.compare_at_value IS 'Compare-at (pre-discount) value excl. GST; compare_at_price = this + GST';
COMMENT ON COLUMN public.product_variants.product_value IS 'Product Value excl. GST for this variant; price = this + GST';

-- GST % on a Product Value in a category (0 when the category has no HSN code).
-- SECURITY DEFINER: the triggers below run as whoever saves the product (a
-- boutique), and the rate must not depend on what that user may read.
CREATE OR REPLACE FUNCTION public.gst_rate_for_value(_category_id uuid, _value numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT CASE
      WHEN h.price_limit IS NULL OR _value <= h.price_limit THEN h.gst_rate
      ELSE coalesce(h.gst_rate_above_limit, h.gst_rate)
    END
    FROM public.categories c
    JOIN public.hsn_codes h ON h.id = c.hsn_code_id
    WHERE c.id = _category_id
  ), 0);
$$;

-- Customer price (MRP incl. GST) for a Product Value.
CREATE OR REPLACE FUNCTION public.price_with_gst(_category_id uuid, _value numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(_value * (1 + public.gst_rate_for_value(_category_id, _value) / 100), 2);
$$;

-- Product Value back from a customer price (for writers that still send a
-- price), using the same rate rule the invoice uses (gst_rate_for).
CREATE OR REPLACE FUNCTION public.value_from_price(_category_id uuid, _price numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(_price / (1 + coalesce((
    SELECT public.gst_rate_for(c.hsn_code_id, _price)
    FROM public.categories c
    WHERE c.id = _category_id AND c.hsn_code_id IS NOT NULL
  ), 0) / 100), 2);
$$;

GRANT EXECUTE ON FUNCTION public.gst_rate_for_value(uuid, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.price_with_gst(uuid, numeric) TO anon, authenticated;

-- ---------- existing data: today's prices are Product Values ----------
-- (filled before the triggers exist, so nothing is worked back)

UPDATE public.products SET product_value = price WHERE product_value IS NULL;
UPDATE public.products SET compare_at_value = compare_at_price WHERE compare_at_value IS NULL AND compare_at_price IS NOT NULL;
UPDATE public.product_variants SET product_value = price WHERE product_value IS NULL AND price IS NOT NULL;

-- ---------- keep price and Product Value in step ----------

CREATE OR REPLACE FUNCTION public.products_price_from_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_value IS NULL AND NEW.price IS NOT NULL THEN
      NEW.product_value := public.value_from_price(NEW.category_id, NEW.price);
    END IF;
    IF NEW.compare_at_value IS NULL AND NEW.compare_at_price IS NOT NULL THEN
      NEW.compare_at_value := public.value_from_price(NEW.category_id, NEW.compare_at_price);
    END IF;
  ELSE
    IF NEW.product_value IS NOT DISTINCT FROM OLD.product_value AND NEW.price IS DISTINCT FROM OLD.price THEN
      NEW.product_value := public.value_from_price(NEW.category_id, NEW.price);
    END IF;
    IF NEW.compare_at_value IS NOT DISTINCT FROM OLD.compare_at_value
       AND NEW.compare_at_price IS DISTINCT FROM OLD.compare_at_price THEN
      NEW.compare_at_value := CASE WHEN NEW.compare_at_price IS NULL THEN NULL
                                   ELSE public.value_from_price(NEW.category_id, NEW.compare_at_price) END;
    END IF;
  END IF;

  IF NEW.product_value IS NOT NULL THEN
    NEW.price := public.price_with_gst(NEW.category_id, NEW.product_value);
  END IF;
  NEW.compare_at_price := CASE WHEN NEW.compare_at_value IS NULL THEN NULL
                               ELSE public.price_with_gst(NEW.category_id, NEW.compare_at_value) END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_price_from_value ON public.products;
CREATE TRIGGER products_price_from_value
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_price_from_value();

CREATE OR REPLACE FUNCTION public.variants_price_from_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_category uuid;
BEGIN
  SELECT category_id INTO v_category FROM public.products WHERE id = NEW.product_id;
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_value IS NULL AND NEW.price IS NOT NULL THEN
      NEW.product_value := public.value_from_price(v_category, NEW.price);
    END IF;
  ELSIF NEW.product_value IS NOT DISTINCT FROM OLD.product_value AND NEW.price IS DISTINCT FROM OLD.price THEN
    NEW.product_value := CASE WHEN NEW.price IS NULL THEN NULL ELSE public.value_from_price(v_category, NEW.price) END;
  END IF;
  IF NEW.product_value IS NOT NULL THEN
    NEW.price := public.price_with_gst(v_category, NEW.product_value);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS variants_price_from_value ON public.product_variants;
CREATE TRIGGER variants_price_from_value
  BEFORE INSERT OR UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.variants_price_from_value();

-- A product moving to another category (another GST rate) re-prices its
-- variants too.
CREATE OR REPLACE FUNCTION public.reprice_variants_on_category_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.product_variants SET product_value = product_value WHERE product_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reprice_variants_on_category_change ON public.products;
CREATE TRIGGER reprice_variants_on_category_change
  AFTER UPDATE OF category_id ON public.products
  FOR EACH ROW WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id)
  EXECUTE FUNCTION public.reprice_variants_on_category_change();

-- Re-price everything once: price = Product Value + GST.
UPDATE public.products SET product_value = product_value;
UPDATE public.product_variants SET product_value = product_value;

-- ===== [091/100] 20261025100000_inr_indian_commas.sql =====
-- Rupee amounts in notifications with Indian commas (Developer Corrections
-- Part 8, 12): ₹14,160 and ₹12,34,567.50 - paise only when there are any,
-- the same as the site's formatINR. Was '₹14160', rounded to the rupee.
CREATE OR REPLACE FUNCTION public.inr(_amount numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v numeric := round(coalesce(_amount, 0), 2);
  neg boolean := v < 0;
  whole text;
  paise text;
BEGIN
  v := abs(v);
  whole := trunc(v)::text;
  paise := lpad(round((v - trunc(v)) * 100)::int::text, 2, '0');
  IF length(whole) > 3 THEN
    whole := regexp_replace(left(whole, length(whole) - 3), '(\d)(?=(\d\d)+$)', '\1,', 'g') || ',' || right(whole, 3);
  END IF;
  RETURN CASE WHEN neg THEN '-' ELSE '' END || '₹' || whole || CASE WHEN paise = '00' THEN '' ELSE '.' || paise END;
END;
$$;

-- ===== [092/100] 20261025110000_size_charts_to_6xl.sql =====
-- Size charts (Developer Corrections Part 8, 40): every chart has XS to
-- 6XL, and opens pre-filled with AllBoutiqs' starting values in inches
-- (bust / waist / hip), which each boutique changes to its own:
--   XS 32/26/36 · S 34/28/38 · M 36/30/40 · L 38/32/42 · XL 40/34/44
--   XXL 42/36/46 · 3XL 44/38/48 · 4XL 46/40/50 · 5XL 48/42/52 · 6XL 50/44/54
-- The saree chart is named for what it measures: "Saree Blouse".
WITH sizes(size, bust, waist, hip, ord) AS (
  VALUES ('XS', 32, 26, 36, 1), ('S', 34, 28, 38, 2), ('M', 36, 30, 40, 3), ('L', 38, 32, 42, 4),
         ('XL', 40, 34, 44, 5), ('XXL', 42, 36, 46, 6), ('3XL', 44, 38, 48, 7), ('4XL', 46, 40, 50, 8),
         ('5XL', 48, 42, 52, 9), ('6XL', 50, 44, 54, 10)
),
starting AS (
  SELECT jsonb_object_agg(size, bust::text) AS bust,
         jsonb_object_agg(size, waist::text) AS waist,
         jsonb_object_agg(size, hip::text) AS hip,
         jsonb_agg(size ORDER BY ord) AS all_sizes
  FROM sizes
)
UPDATE public.size_guides g
SET sizes = s.all_sizes,
    name = CASE lower(g.name) WHEN 'saree blouse' THEN 'Saree Blouse' WHEN 'western wear' THEN 'Western Wear' ELSE g.name END,
    measurements = (
      SELECT jsonb_agg(
               CASE m->>'key'
                 WHEN 'bust' THEN m || jsonb_build_object('values', s.bust)
                 WHEN 'waist' THEN m || jsonb_build_object('values', s.waist)
                 WHEN 'hip' THEN m || jsonb_build_object('values', s.hip)
                 ELSE m
               END ORDER BY x.ord)
      FROM jsonb_array_elements(g.measurements) WITH ORDINALITY AS x(m, ord)
    ),
    updated_at = now()
FROM starting s;

-- ===== [093/100] 20261025120000_customised_returns_24h.sql =====
-- Customised pieces (Part 8 extra list): returnable only when the piece
-- arrived damaged or was the wrong item, and only within 24 hours of
-- delivery - never exchanged. Was: never returnable at all.
--
-- The two reasons must match RETURN_REASONS_CUSTOMISED in
-- src/components/ReturnRequestForm.tsx.

CREATE OR REPLACE FUNCTION public.enforce_return_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR coalesce(auth.role(), 'postgres') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT oi.product_title, oi.customisation IS NOT NULL AS customised, vo.id AS vendor_order_id, vo.status,
           vo.return_window_ends_on, vo.delivered_at
    FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) AS e
    JOIN public.order_items oi ON oi.id::text = e->>'order_item_id'
    LEFT JOIN public.vendor_orders vo ON vo.id = oi.vendor_order_id
  LOOP
    -- Items not sold by a boutique have no delivery tracking to check.
    CONTINUE WHEN r.vendor_order_id IS NULL;
    IF r.status IS DISTINCT FROM 'delivered' THEN
      RAISE EXCEPTION '"%" hasn''t been delivered yet, so it can''t be returned or exchanged.', r.product_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF r.customised THEN
      IF NEW.request_type IS DISTINCT FROM 'return' THEN
        RAISE EXCEPTION '"%" was customised for you, so it can''t be exchanged.', r.product_title
          USING ERRCODE = 'check_violation';
      END IF;
      IF coalesce(NEW.reason, '') NOT IN ('Defective or damaged product', 'Wrong item received') THEN
        RAISE EXCEPTION '"%" was customised for you - it can only be returned if it arrived damaged or was the wrong item.', r.product_title
          USING ERRCODE = 'check_violation';
      END IF;
      IF coalesce(r.delivered_at, now()) + interval '24 hours' < now() THEN
        RAISE EXCEPTION 'The 24-hour return window for "%" (customised) has closed.', r.product_title
          USING ERRCODE = 'check_violation';
      END IF;
      CONTINUE;
    END IF;
    IF r.return_window_ends_on IS NOT NULL AND v_today > r.return_window_ends_on THEN
      RAISE EXCEPTION 'The return window for "%" closed on %.', r.product_title, to_char(r.return_window_ends_on, 'DD-MM-YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- A boutique part made only of customised pieces now has a 1-day window
-- (the 24 hours above), so its payout waits for it like any other part.
CREATE OR REPLACE FUNCTION public.vendor_order_window_end(_vendor_order_id uuid, _delivered_at timestamp with time zone, _window_end date)
RETURNS date
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.order_items oi WHERE oi.vendor_order_id = _vendor_order_id AND oi.customisation IS NULL
    ) THEN (coalesce(_delivered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date + 1
    ELSE coalesce(
      _window_end,
      (coalesce(_delivered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date
        + coalesce((SELECT v.return_window_days FROM public.vendor_orders vo JOIN public.vendors v ON v.id = vo.vendor_id
                    WHERE vo.id = _vendor_order_id), 7))
  END;
$$;

-- ===== [094/100] 20261025130000_unpaid_checkout_alert.sql =====
-- Extra list from the client (C): when a customer gets as far as paying
-- online but no payment comes through, AllBoutiqs' admins get an email with
-- who it was and what they were buying, so they can follow up.
-- release-unpaid-orders sends it once the customer has been quiet for 30
-- minutes (a retry that goes through alerts nobody, and several tries in a
-- row come as one email); this column stamps each checkout it covered.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS unpaid_alert_sent_at timestamptz;

-- Checkouts released before this aren't reported.
UPDATE public.orders
SET unpaid_alert_sent_at = now()
WHERE NOT public.order_is_placed(payment_method, payment_status)
  AND order_status = 'cancelled'
  AND unpaid_alert_sent_at IS NULL;

-- ===== [095/100] 20261025140000_category_coupons.sql =====
-- Extra list from the client (D): coupons for chosen categories.
-- discounts.category_ids: the categories a coupon is for (several allowed);
-- empty = every category. Checkout takes it off only the items in those
-- categories (and, as before but never enforced till now, only the coupon's
-- products / boutique when it has them), and records each line's share in
-- order_items.discount_amount. That share is what the line's boutique,
-- invoice and COD amount now use - so a Kurti coupon is carried by the Kurti
-- alone, not spread over every item in the cart. NULL = an order from before
-- this; it keeps sharing the order's discount over all lines by value.
ALTER TABLE public.discounts ADD COLUMN IF NOT EXISTS category_ids uuid[];
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2)
  CHECK (discount_amount IS NULL OR (discount_amount >= 0 AND discount_amount <= price * quantity));

CREATE OR REPLACE FUNCTION public.compute_vendor_order_fees(_vendor_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  vo public.vendor_orders;
  o public.orders;
  r public.platform_rates;
  it record;
  v_gstin text;
  v_pan text;
  v_constitution text;
  v_supply text;
  v_gross numeric;
  v_disc numeric;
  v_net numeric;
  v_rate numeric;
  v_taxable numeric;
  v_goods numeric := 0;
  v_product numeric := 0;
  v_gst numeric := 0;
  v_hsn_missing boolean := false;
  v_commission_pct numeric;
  v_commission numeric;
  v_tech numeric;
  v_fee_gst numeric;
  v_gateway_rate numeric := 0;
  v_gateway numeric := 0;
  v_ship_to_boutique boolean;
  v_shipping_credit numeric;
  v_courier numeric;
  v_tcs numeric;
  v_tds_rate numeric;
  v_fy_sales numeric;
  v_fy_start date;
  v_tds numeric;
BEGIN
  SELECT * INTO vo FROM vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  -- Money already sent (or batched for sending) stays as it was.
  IF vo.rzp_transfer_id IS NOT NULL OR vo.payout_id IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO o FROM orders WHERE id = vo.order_id;
  r := rates_on(coalesce(o.created_at, now()));
  IF r.id IS NULL THEN RETURN; END IF;

  SELECT coalesce(k.gstin, v.gst_number), coalesce(k.pan, v.pan_number), k.business_constitution
  INTO v_gstin, v_pan, v_constitution
  FROM vendors v LEFT JOIN vendor_kyc k ON k.vendor_id = v.id
  WHERE v.id = vo.vendor_id;
  v_supply := CASE WHEN v_gstin IS NOT NULL AND left(v_gstin, 2) = gst_state_code(o.shipping_address->>'state')
                   THEN 'intra_state' ELSE 'inter_state' END;

  FOR it IN
    SELECT oi.price, oi.quantity, oi.discount_amount, c.hsn_code_id
    FROM order_items oi
    LEFT JOIN products p ON p.id::text = oi.product_id::text
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE oi.vendor_order_id = vo.id
  LOOP
    v_gross := it.price * it.quantity;
    -- The coupon share checkout recorded for this line (only the lines the
    -- coupon covered have one); orders from before that share it by value.
    v_disc := coalesce(it.discount_amount,
      CASE WHEN coalesce(o.subtotal, 0) > 0 THEN round(coalesce(o.discount_amount, 0) * v_gross / o.subtotal, 2) ELSE 0 END);
    v_net := v_gross - v_disc;
    v_rate := gst_rate_for(it.hsn_code_id, v_net / greatest(it.quantity, 1));
    IF v_rate IS NULL THEN
      v_hsn_missing := true;
      v_rate := 0;
    END IF;
    v_taxable := round(v_net / (1 + v_rate / 100), 2);
    v_goods := v_goods + v_net;
    v_product := v_product + v_taxable;
    v_gst := v_gst + (v_net - v_taxable);
  END LOOP;

  v_commission_pct := effective_commission_pct(vo.vendor_id, coalesce(o.created_at, now()));
  v_commission := round(v_product * v_commission_pct / 100, 2);
  v_tech := round(v_product * r.technology_fee_pct / 100, 2);
  v_fee_gst := round((v_commission + v_tech) * r.fee_gst_pct / 100, 2);

  -- Courier: when AllBoutiqs bears it, the customer's shipping charge is
  -- AllBoutiqs' too; when charged to the boutique, the boutique gets the
  -- shipping charge and pays the courier cost (filled in once booked).
  v_ship_to_boutique := r.charge_courier_to_boutique;
  v_shipping_credit := CASE WHEN v_ship_to_boutique THEN coalesce(vo.shipping_cost, 0) ELSE 0 END;
  v_courier := CASE WHEN v_ship_to_boutique THEN coalesce(vo.courier_charge, 0) ELSE 0 END;

  IF o.payment_method = 'razorpay' THEN
    v_gateway_rate := r.payment_gateway_fee_pct;
    v_gateway := round((v_goods + coalesce(vo.shipping_cost, 0)) * v_gateway_rate / 100, 2);
  END IF;

  v_tcs := round(v_product * r.gst_tcs_pct / 100, 2);

  -- Income-tax TDS (194-O): no PAN -> higher rate; individuals
  -- (proprietorships) and HUFs with PAN are free until their sales this
  -- financial year pass the limit; firms and companies from the first order.
  IF v_pan IS NULL THEN
    v_tds_rate := r.tds_no_pan_pct;
  ELSIF coalesce(v_constitution, 'proprietorship') IN ('proprietorship', 'huf') THEN
    v_fy_start := make_date(
      CASE WHEN extract(month FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata')) >= 4
           THEN extract(year FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata'))::int
           ELSE extract(year FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata'))::int - 1 END, 4, 1);
    SELECT coalesce(sum(x.product_value), 0) INTO v_fy_sales
    FROM vendor_orders x JOIN orders xo ON xo.id = x.order_id
    WHERE x.vendor_id = vo.vendor_id AND x.id <> vo.id AND x.status <> 'cancelled'
      AND (xo.created_at AT TIME ZONE 'Asia/Kolkata')::date >= v_fy_start
      AND xo.created_at <= coalesce(o.created_at, now());
    v_tds_rate := CASE WHEN v_fy_sales + v_product > r.tds_individual_exempt_upto THEN r.tds_pct ELSE 0 END;
  ELSE
    v_tds_rate := r.tds_pct;
  END IF;
  v_tds := round(v_product * v_tds_rate / 100, 2);

  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  UPDATE vendor_orders SET
    rates_effective_from = r.effective_from,
    goods_value = v_goods,
    product_value = v_product,
    goods_gst = v_gst,
    supply_type = v_supply,
    commission_rate = v_commission_pct,
    commission_amount = v_commission,
    tech_fee_rate = r.technology_fee_pct,
    tech_fee_amount = v_tech,
    fee_gst_rate = r.fee_gst_pct,
    fee_gst_amount = v_fee_gst,
    gateway_fee_rate = v_gateway_rate,
    gateway_fee_amount = v_gateway,
    shipping_to_boutique = v_ship_to_boutique,
    tcs_rate = r.gst_tcs_pct,
    tcs_amount = v_tcs,
    tds_rate = v_tds_rate,
    tds_amount = v_tds,
    hsn_missing = v_hsn_missing,
    net_payable = round(v_goods + v_shipping_credit - v_commission - v_tech - v_fee_gst - v_gateway
                        - v_courier - coalesce(vo.cod_handling_charge, 0) - v_tcs - v_tds, 2),
    fees_computed_at = now()
  WHERE id = vo.id;
  PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
END;
$function$;

-- ===== [096/100] 20261025150000_seller_terms_consent.sql =====
-- Extra list from the client (E): seller sign-up asks the seller to accept
-- the Privacy Policy and the Seller Terms & Conditions (required - the
-- pages are /privacy-policy and /seller-terms) and whether they want
-- promotional emails from AllBoutiqs (optional). Kept with the seller's
-- private KYC record: when they accepted, which version of the terms, and
-- their promotional-email choice and when it was made.
ALTER TABLE public.vendor_kyc
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS marketing_emails_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz;

CREATE OR REPLACE FUNCTION public.submit_vendor_application(_app jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email_re text := '^[^\s@]+@[^\s@]+\.[^\s@]+$';
  v_name text := btrim(coalesce(_app->>'name', ''));
  v_constitution text := _app->>'business_constitution';
  v_brand_same boolean := coalesce((_app->>'brand_same_as_legal')::boolean, true);
  v_declared boolean := coalesce((_app->>'brand_legal_declaration')::boolean, false);
  v_legal text := btrim(coalesce(_app->>'legal_business_name', ''));
  v_instagram text := public.normalize_instagram_profile(_app->>'instagram_url');
  v_website_raw text := btrim(coalesce(_app->>'website_url', ''));
  v_website text;
  v_addr jsonb := coalesce(_app->'address', '{}'::jsonb);
  v_line1 text := btrim(coalesce(v_addr->>'address_line1', ''));
  v_city text := btrim(coalesce(v_addr->>'city', ''));
  v_state text := btrim(coalesce(v_addr->>'state', ''));
  v_pin text := btrim(coalesce(v_addr->>'pincode', ''));
  v_pan text := upper(btrim(coalesce(_app->>'pan', '')));
  v_gstin text := upper(btrim(coalesce(_app->>'gstin', '')));
  v_primary text := public.normalize_indian_mobile(_app->>'primary_mobile');
  v_alternate text := public.normalize_indian_mobile(_app->>'alternate_mobile');
  v_business_email text := lower(btrim(coalesce(_app->>'business_email', '')));
  v_auth jsonb := coalesce(_app->'authorized_person', '{}'::jsonb);
  v_auth_mobile text := public.normalize_indian_mobile(v_auth->>'mobile');
  v_same boolean := coalesce((_app->>'contact_same_as_authorized')::boolean, true);
  v_contact jsonb := coalesce(_app->'contact_person', '{}'::jsonb);
  v_contact_mobile text := public.normalize_indian_mobile(v_contact->>'mobile');
  v_bank jsonb := coalesce(_app->'bank', '{}'::jsonb);
  v_account text := regexp_replace(coalesce(v_bank->>'account_number', ''), '\s', '', 'g');
  v_ifsc text := upper(btrim(coalesce(v_bank->>'ifsc', '')));
  v_docs jsonb := coalesce(_app->'documents', '[]'::jsonb);
  v_doc jsonb;
  v_types text[] := ARRAY[]::text[];
  v_allowed text[];
  v_missing text[];
  v_base text;
  v_slug text;
  v_try integer := 0;
  v_vendor_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to apply.';
  END IF;
  IF EXISTS (SELECT 1 FROM vendor_members WHERE user_id = v_uid)
     OR EXISTS (SELECT 1 FROM vendors WHERE owner_user_id = v_uid) THEN
    RAISE EXCEPTION 'You already have a store application.';
  END IF;

  IF v_name = '' THEN RAISE EXCEPTION 'Enter your Boutique / Brand Name.'; END IF;
  IF v_brand_same THEN
    v_legal := v_name;
  ELSE
    IF v_legal = '' THEN RAISE EXCEPTION 'Enter your Legal Business Name (as on GST / PAN).'; END IF;
    IF NOT v_declared THEN
      RAISE EXCEPTION 'Tick the declaration that your Boutique / Brand Name belongs to your Legal Business Name.';
    END IF;
  END IF;
  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Enter your Instagram profile link (e.g. https://www.instagram.com/yourboutique).';
  END IF;
  IF v_website_raw <> '' THEN
    v_website := public.normalize_website_url(v_website_raw);
    IF v_website IS NULL THEN RAISE EXCEPTION 'Enter a valid website link, or leave it empty.'; END IF;
  END IF;
  IF v_constitution IS NULL OR v_constitution NOT IN ('proprietorship', 'partnership', 'llp', 'private_limited', 'huf') THEN
    RAISE EXCEPTION 'Select your business type.';
  END IF;
  IF v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN RAISE EXCEPTION 'Enter a valid PAN (e.g. ABCDE1234F).'; END IF;
  IF v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RAISE EXCEPTION 'Enter a valid 15-character GST number.';
  END IF;
  IF substr(v_gstin, 3, 10) <> v_pan THEN
    RAISE EXCEPTION 'The GST number doesn''t match the PAN (characters 3 to 12 of a GST number are the PAN).';
  END IF;
  IF v_primary IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit primary mobile number.'; END IF;
  IF v_alternate IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit alternative mobile number.'; END IF;
  IF v_alternate = v_primary THEN
    RAISE EXCEPTION 'The alternative mobile number must be different from the primary one.';
  END IF;
  IF v_business_email !~ v_email_re THEN RAISE EXCEPTION 'Enter a valid official business email address.'; END IF;

  IF btrim(coalesce(v_auth->>'name', '')) = '' THEN RAISE EXCEPTION 'Enter the authorized person''s full name.'; END IF;
  IF btrim(coalesce(v_auth->>'designation', '')) = '' THEN RAISE EXCEPTION 'Enter the authorized person''s designation.'; END IF;
  IF v_auth_mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit mobile number for the authorized person.'; END IF;
  IF lower(btrim(coalesce(v_auth->>'email', ''))) !~ v_email_re THEN
    RAISE EXCEPTION 'Enter a valid email for the authorized person.';
  END IF;
  IF NOT v_same THEN
    IF btrim(coalesce(v_contact->>'name', '')) = '' OR btrim(coalesce(v_contact->>'designation', '')) = '' THEN
      RAISE EXCEPTION 'Enter the contact person''s name and designation.';
    END IF;
    IF v_contact_mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit mobile number for the contact person.'; END IF;
    IF lower(btrim(coalesce(v_contact->>'email', ''))) !~ v_email_re THEN
      RAISE EXCEPTION 'Enter a valid email for the contact person.';
    END IF;
  END IF;

  IF btrim(coalesce(v_bank->>'account_holder_name', '')) = '' THEN RAISE EXCEPTION 'Enter the bank account holder name.'; END IF;
  IF v_account !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Enter a valid bank account number (9 to 18 digits).'; END IF;
  IF v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Enter a valid 11-character IFSC code.'; END IF;
  IF btrim(coalesce(v_bank->>'bank_name', '')) = '' THEN RAISE EXCEPTION 'Enter the bank name.'; END IF;
  IF coalesce(v_bank->>'proof_type', '') NOT IN ('cancelled_cheque', 'bank_letter', 'bank_statement') THEN
    RAISE EXCEPTION 'Choose the type of bank proof you are uploading.';
  END IF;

  -- Business address = courier pickup address (Shiprocket rejects short
  -- address lines).
  IF length(v_line1) < 10 THEN RAISE EXCEPTION 'Address line 1 needs at least 10 characters.'; END IF;
  IF v_city = '' THEN RAISE EXCEPTION 'Enter your city.'; END IF;
  IF v_state = '' THEN RAISE EXCEPTION 'Select your state.'; END IF;
  IF v_pin !~ '^[1-9][0-9]{5}$' THEN RAISE EXCEPTION 'Enter a valid 6-digit PIN code.'; END IF;

  -- Privacy Policy and Seller Terms must be accepted; promotional emails
  -- are the seller's choice (Extra list E).
  IF NOT coalesce((_app->>'accepted_terms')::boolean, false) THEN
    RAISE EXCEPTION 'Please accept the Privacy Policy and the Seller Terms & Conditions.';
  END IF;

  -- Documents: only this business type's, each a PDF this applicant
  -- uploaded to their own folder.
  v_allowed := public.vendor_required_documents(v_constitution) || public.vendor_optional_documents(v_constitution);
  FOR v_doc IN SELECT * FROM jsonb_array_elements(v_docs) LOOP
    IF NOT (v_doc->>'doc_type' = ANY (v_allowed)) THEN
      RAISE EXCEPTION '% isn''t needed for this business type.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    IF v_doc->>'doc_type' = ANY (v_types) THEN
      RAISE EXCEPTION 'Upload only one %.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    IF coalesce(v_doc->>'file_path', '') NOT LIKE v_uid::text || '/%'
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id = 'vendor-documents' AND o.name = v_doc->>'file_path'
           AND o.metadata->>'mimetype' = 'application/pdf'
       ) THEN
      RAISE EXCEPTION 'The % upload wasn''t found - please upload it again as a PDF.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    v_types := v_types || (v_doc->>'doc_type');
  END LOOP;
  SELECT array_agg(public.vendor_document_label(t)) INTO v_missing
  FROM unnest(public.vendor_required_documents(v_constitution)) AS t
  WHERE NOT (t = ANY (v_types));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Please upload: %.', array_to_string(v_missing, ', ');
  END IF;

  -- Unique storefront slug.
  v_base := nullif(trim(BOTH '-' FROM regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), '');
  v_base := coalesce(v_base, 'store-' || substr(md5(random()::text), 1, 6));
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM vendors WHERE slug = v_slug) LOOP
    v_try := v_try + 1;
    v_slug := v_base || '-' || v_try;
  END LOOP;

  INSERT INTO vendors (
    owner_user_id, name, slug, description, contact_email, contact_phone, gst_number, address,
    shipping_flat_rate, free_shipping_threshold, return_window_days, return_policy,
    status, commission_rate, payout_account_status, rating
  ) VALUES (
    v_uid, v_name, v_slug, nullif(btrim(coalesce(_app->>'description', '')), ''), v_business_email, v_primary, v_gstin,
    jsonb_build_object(
      'address_line1', v_line1,
      'address_line2', btrim(coalesce(v_addr->>'address_line2', '')),
      'city', v_city,
      'state', v_state,
      'pincode', v_pin,
      'country', 'India'
    ),
    coalesce((_app->>'shipping_flat_rate')::numeric, 0),
    nullif(_app->>'free_shipping_threshold', '')::numeric,
    coalesce((_app->>'return_window_days')::integer, 7),
    nullif(btrim(coalesce(_app->>'return_policy', '')), ''),
    'pending', 10, 'not_setup', 0
  )
  RETURNING id INTO v_vendor_id;

  INSERT INTO vendor_members (user_id, vendor_id, role) VALUES (v_uid, v_vendor_id, 'owner');

  INSERT INTO vendor_kyc (
    vendor_id, business_constitution, legal_business_name, pan, gstin, primary_mobile, alternate_mobile,
    business_email, authorized_name, authorized_designation, authorized_mobile, authorized_email,
    contact_same_as_authorized, contact_name, contact_designation, contact_mobile, contact_email, bank_proof_type,
    brand_same_as_legal, brand_legal_declared_at, instagram_url, website_url,
    terms_accepted_at, terms_version, marketing_emails_opt_in, marketing_consent_at
  ) VALUES (
    v_vendor_id, v_constitution, v_legal, v_pan, v_gstin, v_primary, v_alternate,
    v_business_email, btrim(v_auth->>'name'), btrim(v_auth->>'designation'), v_auth_mobile, lower(btrim(v_auth->>'email')),
    v_same,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'name') END,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'designation') END,
    CASE WHEN v_same THEN NULL ELSE v_contact_mobile END,
    CASE WHEN v_same THEN NULL ELSE lower(btrim(v_contact->>'email')) END,
    v_bank->>'proof_type',
    v_brand_same, CASE WHEN v_brand_same THEN NULL ELSE now() END, v_instagram, v_website,
    now(), nullif(btrim(coalesce(_app->>'terms_version', '')), ''),
    coalesce((_app->>'marketing_emails')::boolean, false), now()
  );

  INSERT INTO vendor_documents (vendor_id, doc_type, file_path, file_name, file_size, uploaded_by)
  SELECT v_vendor_id, d->>'doc_type', d->>'file_path', coalesce(nullif(d->>'file_name', ''), 'document.pdf'),
         nullif(d->>'file_size', '')::integer, v_uid
  FROM jsonb_array_elements(v_docs) AS d;

  -- Same table the Payouts tab and Razorpay onboarding use.
  INSERT INTO vendor_payout_accounts (
    vendor_id, account_holder_name, bank_account_number, bank_ifsc, bank_name, business_type, pan, legal_business_name
  ) VALUES (
    v_vendor_id, btrim(v_bank->>'account_holder_name'), v_account, v_ifsc, btrim(v_bank->>'bank_name'),
    v_constitution, v_pan, v_legal
  );

  PERFORM public.notify_admins('other', 'vendor_application', 'New boutique application',
    format('%s (%s) applied to sell on AllBoutiqs.', v_name,
           replace(replace(initcap(replace(v_constitution, '_', ' ')), 'Llp', 'LLP'), 'Huf', 'HUF')),
    '/admin?tab=vendors&sub=applications');

  RETURN v_vendor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_vendor_application(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application(jsonb) TO authenticated;

-- ===== [097/100] 20261025160000_pickup_address_rules.sql =====
-- Extra list from the client (F): Shiprocket refuses a pickup location whose
-- address line 1 or state is only a few letters, so the booking fails long
-- after the address was saved. A boutique's address (registration, Store
-- settings, admin edits) and the warehouse's are now checked when saved -
-- the same rules as src/lib/pickupAddress.ts:
--   address line 1 at least 10 characters; lines 1 + 2 at most 190;
--   city at least 3 letters; a real Indian state; a 6-digit PIN code.
-- An address not filled in yet (empty) is still allowed - it just can't be
-- used to ship until it is. Rows saved before this aren't re-checked until
-- their address changes.

CREATE OR REPLACE FUNCTION public.pickup_address_problem(_addr jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_line1 text := btrim(coalesce(_addr->>'address_line1', ''));
  v_line2 text := btrim(coalesce(_addr->>'address_line2', ''));
  v_city text := btrim(coalesce(_addr->>'city', ''));
  v_state text := btrim(coalesce(_addr->>'state', ''));
  v_pin text := btrim(coalesce(_addr->>'pincode', ''));
BEGIN
  IF v_line1 = '' AND v_line2 = '' AND v_city = '' AND v_state = '' AND v_pin = '' THEN
    RETURN NULL;
  END IF;
  IF length(v_line1) < 10 THEN
    RETURN 'Address line 1 needs at least 10 characters - shop / building number, street and area.';
  END IF;
  IF length(v_line1) + length(v_line2) > 190 THEN
    RETURN 'Address lines 1 and 2 together can have at most 190 characters.';
  END IF;
  IF length(v_city) < 3 OR v_city !~ '^[A-Za-z][A-Za-z .''-]*$' THEN
    RETURN 'Enter the full city name (letters only).';
  END IF;
  IF public.gst_state_code(v_state) IS NULL THEN
    RETURN 'Select a valid Indian state.';
  END IF;
  IF v_pin !~ '^[1-9][0-9]{5}$' THEN
    RETURN 'Enter a valid 6-digit PIN code.';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_pickup_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_problem text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.address IS NOT DISTINCT FROM OLD.address THEN
    RETURN NEW;
  END IF;
  v_problem := public.pickup_address_problem(coalesce(NEW.address, '{}'::jsonb));
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'Pickup address: %', v_problem USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_pickup_address_trigger ON public.vendors;
CREATE TRIGGER check_pickup_address_trigger
  BEFORE INSERT OR UPDATE OF address ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.check_pickup_address();

DROP TRIGGER IF EXISTS check_pickup_address_trigger ON public.warehouses;
CREATE TRIGGER check_pickup_address_trigger
  BEFORE INSERT OR UPDATE OF address ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.check_pickup_address();

-- ===== [098/100] 20261025170000_statement_discount_shipping.sql =====
-- Extra list from the client (H + I): the boutique's Reports area shows,
-- for its completed orders, every amount between the sale and the payout -
-- the statement lines had all of them except the coupon share and the
-- shipping charge the boutique is credited with when it bears the courier.
-- Both added (at the end, so existing readers are unaffected). The return
-- type changes, so the function is dropped and created again.
DROP FUNCTION IF EXISTS public.statement_lines(uuid, date, date);

CREATE OR REPLACE FUNCTION public.statement_lines(_vendor_id uuid, _from date, _to date)
 RETURNS TABLE(vendor_id uuid, boutique_code text, boutique_name text, vendor_order_id uuid, order_number text, order_date date, delivered_on date, status text, payment_method text, supply_type text, goods_value numeric, product_value numeric, gst numeric, commission numeric, tech_fee numeric, fee_gst numeric, gateway_fee numeric, courier numeric, cod_charge numeric, refunded numeric, net_taxable numeric, tcs_rate numeric, tcs_cgst numeric, tcs_sgst numeric, tcs_igst numeric, tds_rate numeric, tds numeric, net_payout numeric, payout_status text, payment_date date, utr text, fee_invoice_number text, discount numeric, shipping_credit numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           fi.invoice_number AS fee_inv,
           -- This boutique's share of the coupon: what checkout recorded on
           -- its lines, or (older orders) the order's discount by value.
           coalesce(
             (SELECT CASE WHEN bool_or(oi.discount_amount IS NOT NULL) THEN sum(coalesce(oi.discount_amount, 0)) END
              FROM order_items oi WHERE oi.vendor_order_id = vo.id),
             CASE WHEN coalesce(o.subtotal, 0) > 0 THEN round(coalesce(o.discount_amount, 0) * vo.subtotal / o.subtotal, 2) ELSE 0 END
           ) AS disc_share
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
         t.fee_inv,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.disc_share END,
         CASE WHEN t.is_cancelled OR NOT t.shipping_to_boutique THEN 0 ELSE coalesce(t.shipping_cost, 0) END
  FROM taxed t
  ORDER BY t.order_created, t.bname;
END;
$function$;

REVOKE ALL ON FUNCTION public.statement_lines(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.statement_lines(uuid, date, date) TO authenticated, service_role;

-- ===== [099/100] 20261025180000_cod_charge_to_customer.sql =====
-- Extra list from the client (M): a Cash on Delivery order now charges the
-- customer Shiprocket's real COD charge for the parcel (worked out at
-- checkout by shiprocket-cod-charge: warehouse -> customer PIN, weight,
-- order value, the courier the warehouse books by default). It is part of
-- the order total and of what the courier collects. Since the customer
-- pays it, the boutique is no longer charged the COD handling charge on
-- such an order (orders from before keep it).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_charge numeric(12,2) NOT NULL DEFAULT 0
  CHECK (cod_charge >= 0);

CREATE OR REPLACE FUNCTION public.compute_vendor_order_fees(_vendor_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  vo public.vendor_orders;
  o public.orders;
  r public.platform_rates;
  it record;
  v_gstin text;
  v_pan text;
  v_constitution text;
  v_supply text;
  v_gross numeric;
  v_disc numeric;
  v_net numeric;
  v_rate numeric;
  v_taxable numeric;
  v_goods numeric := 0;
  v_product numeric := 0;
  v_gst numeric := 0;
  v_hsn_missing boolean := false;
  v_commission_pct numeric;
  v_commission numeric;
  v_tech numeric;
  v_fee_gst numeric;
  v_gateway_rate numeric := 0;
  v_gateway numeric := 0;
  v_ship_to_boutique boolean;
  v_shipping_credit numeric;
  v_courier numeric;
  v_tcs numeric;
  v_tds_rate numeric;
  v_fy_sales numeric;
  v_fy_start date;
  v_tds numeric;
BEGIN
  SELECT * INTO vo FROM vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  -- Money already sent (or batched for sending) stays as it was.
  IF vo.rzp_transfer_id IS NOT NULL OR vo.payout_id IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO o FROM orders WHERE id = vo.order_id;
  r := rates_on(coalesce(o.created_at, now()));
  IF r.id IS NULL THEN RETURN; END IF;

  SELECT coalesce(k.gstin, v.gst_number), coalesce(k.pan, v.pan_number), k.business_constitution
  INTO v_gstin, v_pan, v_constitution
  FROM vendors v LEFT JOIN vendor_kyc k ON k.vendor_id = v.id
  WHERE v.id = vo.vendor_id;
  v_supply := CASE WHEN v_gstin IS NOT NULL AND left(v_gstin, 2) = gst_state_code(o.shipping_address->>'state')
                   THEN 'intra_state' ELSE 'inter_state' END;

  FOR it IN
    SELECT oi.price, oi.quantity, oi.discount_amount, c.hsn_code_id
    FROM order_items oi
    LEFT JOIN products p ON p.id::text = oi.product_id::text
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE oi.vendor_order_id = vo.id
  LOOP
    v_gross := it.price * it.quantity;
    -- The coupon share checkout recorded for this line (only the lines the
    -- coupon covered have one); orders from before that share it by value.
    v_disc := coalesce(it.discount_amount,
      CASE WHEN coalesce(o.subtotal, 0) > 0 THEN round(coalesce(o.discount_amount, 0) * v_gross / o.subtotal, 2) ELSE 0 END);
    v_net := v_gross - v_disc;
    v_rate := gst_rate_for(it.hsn_code_id, v_net / greatest(it.quantity, 1));
    IF v_rate IS NULL THEN
      v_hsn_missing := true;
      v_rate := 0;
    END IF;
    v_taxable := round(v_net / (1 + v_rate / 100), 2);
    v_goods := v_goods + v_net;
    v_product := v_product + v_taxable;
    v_gst := v_gst + (v_net - v_taxable);
  END LOOP;

  v_commission_pct := effective_commission_pct(vo.vendor_id, coalesce(o.created_at, now()));
  v_commission := round(v_product * v_commission_pct / 100, 2);
  v_tech := round(v_product * r.technology_fee_pct / 100, 2);
  v_fee_gst := round((v_commission + v_tech) * r.fee_gst_pct / 100, 2);

  -- Courier: when AllBoutiqs bears it, the customer's shipping charge is
  -- AllBoutiqs' too; when charged to the boutique, the boutique gets the
  -- shipping charge and pays the courier cost (filled in once booked).
  v_ship_to_boutique := r.charge_courier_to_boutique;
  v_shipping_credit := CASE WHEN v_ship_to_boutique THEN coalesce(vo.shipping_cost, 0) ELSE 0 END;
  v_courier := CASE WHEN v_ship_to_boutique THEN coalesce(vo.courier_charge, 0) ELSE 0 END;

  IF o.payment_method = 'razorpay' THEN
    v_gateway_rate := r.payment_gateway_fee_pct;
    v_gateway := round((v_goods + coalesce(vo.shipping_cost, 0)) * v_gateway_rate / 100, 2);
  END IF;

  v_tcs := round(v_product * r.gst_tcs_pct / 100, 2);

  -- Income-tax TDS (194-O): no PAN -> higher rate; individuals
  -- (proprietorships) and HUFs with PAN are free until their sales this
  -- financial year pass the limit; firms and companies from the first order.
  IF v_pan IS NULL THEN
    v_tds_rate := r.tds_no_pan_pct;
  ELSIF coalesce(v_constitution, 'proprietorship') IN ('proprietorship', 'huf') THEN
    v_fy_start := make_date(
      CASE WHEN extract(month FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata')) >= 4
           THEN extract(year FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata'))::int
           ELSE extract(year FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata'))::int - 1 END, 4, 1);
    SELECT coalesce(sum(x.product_value), 0) INTO v_fy_sales
    FROM vendor_orders x JOIN orders xo ON xo.id = x.order_id
    WHERE x.vendor_id = vo.vendor_id AND x.id <> vo.id AND x.status <> 'cancelled'
      AND (xo.created_at AT TIME ZONE 'Asia/Kolkata')::date >= v_fy_start
      AND xo.created_at <= coalesce(o.created_at, now());
    v_tds_rate := CASE WHEN v_fy_sales + v_product > r.tds_individual_exempt_upto THEN r.tds_pct ELSE 0 END;
  ELSE
    v_tds_rate := r.tds_pct;
  END IF;
  v_tds := round(v_product * v_tds_rate / 100, 2);

  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  UPDATE vendor_orders SET
    rates_effective_from = r.effective_from,
    goods_value = v_goods,
    product_value = v_product,
    goods_gst = v_gst,
    supply_type = v_supply,
    commission_rate = v_commission_pct,
    commission_amount = v_commission,
    tech_fee_rate = r.technology_fee_pct,
    tech_fee_amount = v_tech,
    fee_gst_rate = r.fee_gst_pct,
    fee_gst_amount = v_fee_gst,
    gateway_fee_rate = v_gateway_rate,
    gateway_fee_amount = v_gateway,
    shipping_to_boutique = v_ship_to_boutique,
    tcs_rate = r.gst_tcs_pct,
    tcs_amount = v_tcs,
    tds_rate = v_tds_rate,
    tds_amount = v_tds,
    hsn_missing = v_hsn_missing,
    net_payable = round(v_goods + v_shipping_credit - v_commission - v_tech - v_fee_gst - v_gateway
                        - v_courier
                        -- The customer paid the COD charge at checkout (Extra
                        -- list M): the boutique doesn't pay it as well.
                        - CASE WHEN coalesce(o.cod_charge, 0) > 0 THEN 0 ELSE coalesce(vo.cod_handling_charge, 0) END
                        - v_tcs - v_tds, 2),
    fees_computed_at = now()
  WHERE id = vo.id;
  PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
END;
$function$;

-- The statement (and the Reports tab) shows the boutique no COD charge on
-- an order whose customer paid it, matching its payout.
CREATE OR REPLACE FUNCTION public.statement_lines(_vendor_id uuid, _from date, _to date)
 RETURNS TABLE(vendor_id uuid, boutique_code text, boutique_name text, vendor_order_id uuid, order_number text, order_date date, delivered_on date, status text, payment_method text, supply_type text, goods_value numeric, product_value numeric, gst numeric, commission numeric, tech_fee numeric, fee_gst numeric, gateway_fee numeric, courier numeric, cod_charge numeric, refunded numeric, net_taxable numeric, tcs_rate numeric, tcs_cgst numeric, tcs_sgst numeric, tcs_igst numeric, tds_rate numeric, tds numeric, net_payout numeric, payout_status text, payment_date date, utr text, fee_invoice_number text, discount numeric, shipping_credit numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT (_vendor_id IS NOT NULL AND public.is_vendor_member(auth.uid(), _vendor_id))
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'You can only download your own statement';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT vo.*, o.created_at AS order_created, o.payment_method AS pay_method, o.cod_charge AS customer_cod,
           v.boutique_code AS bcode, v.name AS bname,
           vp.paid_at AS manual_paid_at, vp.payment_reference AS manual_utr,
           fi.invoice_number AS fee_inv,
           -- This boutique's share of the coupon: what checkout recorded on
           -- its lines, or (older orders) the order's discount by value.
           coalesce(
             (SELECT CASE WHEN bool_or(oi.discount_amount IS NOT NULL) THEN sum(coalesce(oi.discount_amount, 0)) END
              FROM order_items oi WHERE oi.vendor_order_id = vo.id),
             CASE WHEN coalesce(o.subtotal, 0) > 0 THEN round(coalesce(o.discount_amount, 0) * vo.subtotal / o.subtotal, 2) ELSE 0 END
           ) AS disc_share
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
         t.courier_charge,
         CASE WHEN coalesce(t.customer_cod, 0) > 0 THEN 0 ELSE t.cod_handling_charge END,
         t.refunded_amt, t.net_tax,
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
         t.fee_inv,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.disc_share END,
         CASE WHEN t.is_cancelled OR NOT t.shipping_to_boutique THEN 0 ELSE coalesce(t.shipping_cost, 0) END
  FROM taxed t
  ORDER BY t.order_created, t.bname;
END;
$function$;

-- ===== [100/100] 20261025190000_consent_at_sign_up.sql =====
-- Privacy Policy / Terms (required) and promotional emails (optional) are
-- asked when an account is created - customers and sellers alike - not in
-- the seller registration form (the user, 25 Oct). An account made another
-- way (a sign-in code for a new email/number, or from before this) is asked
-- once, on its first sign-in.
-- Kept on the person's profile; written only through accept_terms(), which
-- stamps the time on the server - a person can't edit or backdate it.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS seller_terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_terms_version text,
  ADD COLUMN IF NOT EXISTS marketing_emails_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz;

-- _kind: 'customer' (Privacy Policy + Terms & Conditions) or 'seller'
-- (Privacy Policy + Seller Terms & Conditions). _marketing null = leave the
-- promotional-email choice as it is.
CREATE OR REPLACE FUNCTION public.accept_terms(_kind text, _version text, _marketing boolean DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  IF _kind NOT IN ('customer', 'seller') THEN RAISE EXCEPTION 'Unknown terms: %', _kind; END IF;
  IF coalesce(btrim(_version), '') = '' THEN RAISE EXCEPTION 'Terms version is required.'; END IF;
  INSERT INTO profiles (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  PERFORM set_config('app.consent_write', 'on', true);
  UPDATE profiles SET
    terms_accepted_at = CASE WHEN _kind = 'customer' THEN now() ELSE terms_accepted_at END,
    terms_version = CASE WHEN _kind = 'customer' THEN _version ELSE terms_version END,
    seller_terms_accepted_at = CASE WHEN _kind = 'seller' THEN now() ELSE seller_terms_accepted_at END,
    seller_terms_version = CASE WHEN _kind = 'seller' THEN _version ELSE seller_terms_version END,
    marketing_emails_opt_in = coalesce(_marketing, marketing_emails_opt_in),
    marketing_consent_at = CASE WHEN _marketing IS NULL THEN marketing_consent_at ELSE now() END
  WHERE user_id = v_uid;
  PERFORM set_config('app.consent_write', 'off', true);
END;
$$;
REVOKE ALL ON FUNCTION public.accept_terms(text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_terms(text, text, boolean) TO authenticated;

-- Profiles are the person's own to edit, but not these.
CREATE OR REPLACE FUNCTION public.protect_consent_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.consent_write', true), 'off') = 'on' OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.terms_accepted_at := NULL; NEW.terms_version := NULL;
    NEW.seller_terms_accepted_at := NULL; NEW.seller_terms_version := NULL;
    NEW.marketing_emails_opt_in := false; NEW.marketing_consent_at := NULL;
  ELSE
    NEW.terms_accepted_at := OLD.terms_accepted_at; NEW.terms_version := OLD.terms_version;
    NEW.seller_terms_accepted_at := OLD.seller_terms_accepted_at; NEW.seller_terms_version := OLD.seller_terms_version;
    NEW.marketing_emails_opt_in := OLD.marketing_emails_opt_in; NEW.marketing_consent_at := OLD.marketing_consent_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_consent_columns_trigger ON public.profiles;
CREATE TRIGGER protect_consent_columns_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_consent_columns();

-- The seller application takes the consent from the seller's profile.
CREATE OR REPLACE FUNCTION public.submit_vendor_application(_app jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email_re text := '^[^\s@]+@[^\s@]+\.[^\s@]+$';
  v_name text := btrim(coalesce(_app->>'name', ''));
  v_constitution text := _app->>'business_constitution';
  v_brand_same boolean := coalesce((_app->>'brand_same_as_legal')::boolean, true);
  v_declared boolean := coalesce((_app->>'brand_legal_declaration')::boolean, false);
  v_legal text := btrim(coalesce(_app->>'legal_business_name', ''));
  v_instagram text := public.normalize_instagram_profile(_app->>'instagram_url');
  v_website_raw text := btrim(coalesce(_app->>'website_url', ''));
  v_website text;
  v_addr jsonb := coalesce(_app->'address', '{}'::jsonb);
  v_line1 text := btrim(coalesce(v_addr->>'address_line1', ''));
  v_city text := btrim(coalesce(v_addr->>'city', ''));
  v_state text := btrim(coalesce(v_addr->>'state', ''));
  v_pin text := btrim(coalesce(v_addr->>'pincode', ''));
  v_pan text := upper(btrim(coalesce(_app->>'pan', '')));
  v_gstin text := upper(btrim(coalesce(_app->>'gstin', '')));
  v_primary text := public.normalize_indian_mobile(_app->>'primary_mobile');
  v_alternate text := public.normalize_indian_mobile(_app->>'alternate_mobile');
  v_business_email text := lower(btrim(coalesce(_app->>'business_email', '')));
  v_auth jsonb := coalesce(_app->'authorized_person', '{}'::jsonb);
  v_auth_mobile text := public.normalize_indian_mobile(v_auth->>'mobile');
  v_same boolean := coalesce((_app->>'contact_same_as_authorized')::boolean, true);
  v_contact jsonb := coalesce(_app->'contact_person', '{}'::jsonb);
  v_contact_mobile text := public.normalize_indian_mobile(v_contact->>'mobile');
  v_bank jsonb := coalesce(_app->'bank', '{}'::jsonb);
  v_account text := regexp_replace(coalesce(v_bank->>'account_number', ''), '\s', '', 'g');
  v_ifsc text := upper(btrim(coalesce(v_bank->>'ifsc', '')));
  v_docs jsonb := coalesce(_app->'documents', '[]'::jsonb);
  v_doc jsonb;
  v_types text[] := ARRAY[]::text[];
  v_allowed text[];
  v_missing text[];
  v_base text;
  v_slug text;
  v_try integer := 0;
  v_vendor_id uuid;
  v_terms_at timestamptz;
  v_terms_version text;
  v_marketing boolean;
  v_marketing_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to apply.';
  END IF;
  IF EXISTS (SELECT 1 FROM vendor_members WHERE user_id = v_uid)
     OR EXISTS (SELECT 1 FROM vendors WHERE owner_user_id = v_uid) THEN
    RAISE EXCEPTION 'You already have a store application.';
  END IF;

  IF v_name = '' THEN RAISE EXCEPTION 'Enter your Boutique / Brand Name.'; END IF;
  IF v_brand_same THEN
    v_legal := v_name;
  ELSE
    IF v_legal = '' THEN RAISE EXCEPTION 'Enter your Legal Business Name (as on GST / PAN).'; END IF;
    IF NOT v_declared THEN
      RAISE EXCEPTION 'Tick the declaration that your Boutique / Brand Name belongs to your Legal Business Name.';
    END IF;
  END IF;
  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Enter your Instagram profile link (e.g. https://www.instagram.com/yourboutique).';
  END IF;
  IF v_website_raw <> '' THEN
    v_website := public.normalize_website_url(v_website_raw);
    IF v_website IS NULL THEN RAISE EXCEPTION 'Enter a valid website link, or leave it empty.'; END IF;
  END IF;
  IF v_constitution IS NULL OR v_constitution NOT IN ('proprietorship', 'partnership', 'llp', 'private_limited', 'huf') THEN
    RAISE EXCEPTION 'Select your business type.';
  END IF;
  IF v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN RAISE EXCEPTION 'Enter a valid PAN (e.g. ABCDE1234F).'; END IF;
  IF v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RAISE EXCEPTION 'Enter a valid 15-character GST number.';
  END IF;
  IF substr(v_gstin, 3, 10) <> v_pan THEN
    RAISE EXCEPTION 'The GST number doesn''t match the PAN (characters 3 to 12 of a GST number are the PAN).';
  END IF;
  IF v_primary IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit primary mobile number.'; END IF;
  IF v_alternate IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit alternative mobile number.'; END IF;
  IF v_alternate = v_primary THEN
    RAISE EXCEPTION 'The alternative mobile number must be different from the primary one.';
  END IF;
  IF v_business_email !~ v_email_re THEN RAISE EXCEPTION 'Enter a valid official business email address.'; END IF;

  IF btrim(coalesce(v_auth->>'name', '')) = '' THEN RAISE EXCEPTION 'Enter the authorized person''s full name.'; END IF;
  IF btrim(coalesce(v_auth->>'designation', '')) = '' THEN RAISE EXCEPTION 'Enter the authorized person''s designation.'; END IF;
  IF v_auth_mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit mobile number for the authorized person.'; END IF;
  IF lower(btrim(coalesce(v_auth->>'email', ''))) !~ v_email_re THEN
    RAISE EXCEPTION 'Enter a valid email for the authorized person.';
  END IF;
  IF NOT v_same THEN
    IF btrim(coalesce(v_contact->>'name', '')) = '' OR btrim(coalesce(v_contact->>'designation', '')) = '' THEN
      RAISE EXCEPTION 'Enter the contact person''s name and designation.';
    END IF;
    IF v_contact_mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit mobile number for the contact person.'; END IF;
    IF lower(btrim(coalesce(v_contact->>'email', ''))) !~ v_email_re THEN
      RAISE EXCEPTION 'Enter a valid email for the contact person.';
    END IF;
  END IF;

  IF btrim(coalesce(v_bank->>'account_holder_name', '')) = '' THEN RAISE EXCEPTION 'Enter the bank account holder name.'; END IF;
  IF v_account !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Enter a valid bank account number (9 to 18 digits).'; END IF;
  IF v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Enter a valid 11-character IFSC code.'; END IF;
  IF btrim(coalesce(v_bank->>'bank_name', '')) = '' THEN RAISE EXCEPTION 'Enter the bank name.'; END IF;
  IF coalesce(v_bank->>'proof_type', '') NOT IN ('cancelled_cheque', 'bank_letter', 'bank_statement') THEN
    RAISE EXCEPTION 'Choose the type of bank proof you are uploading.';
  END IF;

  -- Business address = courier pickup address (Shiprocket rejects short
  -- address lines).
  IF length(v_line1) < 10 THEN RAISE EXCEPTION 'Address line 1 needs at least 10 characters.'; END IF;
  IF v_city = '' THEN RAISE EXCEPTION 'Enter your city.'; END IF;
  IF v_state = '' THEN RAISE EXCEPTION 'Select your state.'; END IF;
  IF v_pin !~ '^[1-9][0-9]{5}$' THEN RAISE EXCEPTION 'Enter a valid 6-digit PIN code.'; END IF;

  -- Privacy Policy and Seller Terms are accepted when the seller's account
  -- is created (or on first sign-in), not in this form; promotional emails
  -- are their choice then too.
  SELECT seller_terms_accepted_at, seller_terms_version, marketing_emails_opt_in, marketing_consent_at
  INTO v_terms_at, v_terms_version, v_marketing, v_marketing_at
  FROM profiles WHERE user_id = v_uid;
  IF v_terms_at IS NULL THEN
    RAISE EXCEPTION 'Please accept the Privacy Policy and the Seller Terms & Conditions first.';
  END IF;

  -- Documents: only this business type's, each a PDF this applicant
  -- uploaded to their own folder.
  v_allowed := public.vendor_required_documents(v_constitution) || public.vendor_optional_documents(v_constitution);
  FOR v_doc IN SELECT * FROM jsonb_array_elements(v_docs) LOOP
    IF NOT (v_doc->>'doc_type' = ANY (v_allowed)) THEN
      RAISE EXCEPTION '% isn''t needed for this business type.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    IF v_doc->>'doc_type' = ANY (v_types) THEN
      RAISE EXCEPTION 'Upload only one %.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    IF coalesce(v_doc->>'file_path', '') NOT LIKE v_uid::text || '/%'
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id = 'vendor-documents' AND o.name = v_doc->>'file_path'
           AND o.metadata->>'mimetype' = 'application/pdf'
       ) THEN
      RAISE EXCEPTION 'The % upload wasn''t found - please upload it again as a PDF.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    v_types := v_types || (v_doc->>'doc_type');
  END LOOP;
  SELECT array_agg(public.vendor_document_label(t)) INTO v_missing
  FROM unnest(public.vendor_required_documents(v_constitution)) AS t
  WHERE NOT (t = ANY (v_types));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Please upload: %.', array_to_string(v_missing, ', ');
  END IF;

  -- Unique storefront slug.
  v_base := nullif(trim(BOTH '-' FROM regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), '');
  v_base := coalesce(v_base, 'store-' || substr(md5(random()::text), 1, 6));
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM vendors WHERE slug = v_slug) LOOP
    v_try := v_try + 1;
    v_slug := v_base || '-' || v_try;
  END LOOP;

  INSERT INTO vendors (
    owner_user_id, name, slug, description, contact_email, contact_phone, gst_number, address,
    shipping_flat_rate, free_shipping_threshold, return_window_days, return_policy,
    status, commission_rate, payout_account_status, rating
  ) VALUES (
    v_uid, v_name, v_slug, nullif(btrim(coalesce(_app->>'description', '')), ''), v_business_email, v_primary, v_gstin,
    jsonb_build_object(
      'address_line1', v_line1,
      'address_line2', btrim(coalesce(v_addr->>'address_line2', '')),
      'city', v_city,
      'state', v_state,
      'pincode', v_pin,
      'country', 'India'
    ),
    coalesce((_app->>'shipping_flat_rate')::numeric, 0),
    nullif(_app->>'free_shipping_threshold', '')::numeric,
    coalesce((_app->>'return_window_days')::integer, 7),
    nullif(btrim(coalesce(_app->>'return_policy', '')), ''),
    'pending', 10, 'not_setup', 0
  )
  RETURNING id INTO v_vendor_id;

  INSERT INTO vendor_members (user_id, vendor_id, role) VALUES (v_uid, v_vendor_id, 'owner');

  INSERT INTO vendor_kyc (
    vendor_id, business_constitution, legal_business_name, pan, gstin, primary_mobile, alternate_mobile,
    business_email, authorized_name, authorized_designation, authorized_mobile, authorized_email,
    contact_same_as_authorized, contact_name, contact_designation, contact_mobile, contact_email, bank_proof_type,
    brand_same_as_legal, brand_legal_declared_at, instagram_url, website_url,
    terms_accepted_at, terms_version, marketing_emails_opt_in, marketing_consent_at
  ) VALUES (
    v_vendor_id, v_constitution, v_legal, v_pan, v_gstin, v_primary, v_alternate,
    v_business_email, btrim(v_auth->>'name'), btrim(v_auth->>'designation'), v_auth_mobile, lower(btrim(v_auth->>'email')),
    v_same,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'name') END,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'designation') END,
    CASE WHEN v_same THEN NULL ELSE v_contact_mobile END,
    CASE WHEN v_same THEN NULL ELSE lower(btrim(v_contact->>'email')) END,
    v_bank->>'proof_type',
    v_brand_same, CASE WHEN v_brand_same THEN NULL ELSE now() END, v_instagram, v_website,
    v_terms_at, v_terms_version, coalesce(v_marketing, false), v_marketing_at
  );

  INSERT INTO vendor_documents (vendor_id, doc_type, file_path, file_name, file_size, uploaded_by)
  SELECT v_vendor_id, d->>'doc_type', d->>'file_path', coalesce(nullif(d->>'file_name', ''), 'document.pdf'),
         nullif(d->>'file_size', '')::integer, v_uid
  FROM jsonb_array_elements(v_docs) AS d;

  -- Same table the Payouts tab and Razorpay onboarding use.
  INSERT INTO vendor_payout_accounts (
    vendor_id, account_holder_name, bank_account_number, bank_ifsc, bank_name, business_type, pan, legal_business_name
  ) VALUES (
    v_vendor_id, btrim(v_bank->>'account_holder_name'), v_account, v_ifsc, btrim(v_bank->>'bank_name'),
    v_constitution, v_pan, v_legal
  );

  PERFORM public.notify_admins('other', 'vendor_application', 'New boutique application',
    format('%s (%s) applied to sell on AllBoutiqs.', v_name,
           replace(replace(initcap(replace(v_constitution, '_', ' ')), 'Llp', 'LLP'), 'Huf', 'HUF')),
    '/admin?tab=vendors&sub=applications');

  RETURN v_vendor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_vendor_application(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application(jsonb) TO authenticated;

-- ===== Record the migrations above as applied (same table the Supabase CLI uses) =====
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text NOT NULL PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260109180822', 'f2fa9873-cbb1-4cb9-ace9-9cdc8deb9e4f'),
  ('20260112192522', '98ed0aa5-94ad-4010-9aee-51c725ccb922'),
  ('20260118212849', 'ae5f64b8-7557-4c0b-b61e-7776005a36fd'),
  ('20260207193644', 'c470cc76-cfd4-4570-91e6-0d363832d8c3'),
  ('20260331234341', 'e5470a7f-0e2d-44a6-9c00-58ec4afd6b40'),
  ('20260616053410', 'e3760b59-12f6-4f90-9725-2808317b21a5'),
  ('20260817044244', '93e36a46-4080-4453-b7cf-87bc35f9805e'),
  ('20260817044300', 'f1d7ebbb-0e3c-4bb4-b9ed-df3fe73143ee'),
  ('20260819150000', 'fix_checkout_rls_gaps'),
  ('20260819151500', 'fix_guest_order_items_payments_rls'),
  ('20260819160000', 'marketplace_phase0_foundations'),
  ('20260819161500', 'fix_vendor_registration_rls'),
  ('20260820090000', 'vendor_order_fulfillment_visibility'),
  ('20260820091500', 'fix_vendor_orders_rls_recursion'),
  ('20260820100000', 'vendor_payout_accounts'),
  ('20260820103000', 'protect_vendor_admin_only_fields'),
  ('20260820110000', 'razorpay_payment_fields'),
  ('20260821090000', 'fix_payment_status_and_gateway_fees'),
  ('20260821100000', 'inventory_system_foundation'),
  ('20260821110000', 'adjust_stock_variant_fallback'),
  ('20260821120000', 'cancel_pending_order_function'),
  ('20260822090000', 'require_signin_drop_guest_checkout'),
  ('20260822090100', 'saved_addresses'),
  ('20260822100000', 'product_variant_images'),
  ('20260822110000', 'shiprocket_foundations'),
  ('20260822120000', 'shiprocket_pickup_id'),
  ('20260823090000', 'vendor_image_upload_storage'),
  ('20260824090000', 'product_specifications'),
  ('20260824100000', 'shipment_channel_order_id'),
  ('20260824120000', 'refunds_table'),
  ('20260824130000', 'product_returnability'),
  ('20260826100000', 'payment_events_disputes_settlements'),
  ('20260829090000', 'customer_avatar_upload_rls'),
  ('20260829120000', 'order_cancellations'),
  ('20260829140000', 'shipment_estimated_delivery'),
  ('20260830090000', 'return_requests_vendor_visibility'),
  ('20260830100000', 'vendor_payouts_wiring'),
  ('20260830110000', 'payments_vendor_visibility'),
  ('20260830120000', 'invoices'),
  ('20260912120000', 'order_discount_snapshot'),
  ('20260929100000', 'order_list_seen'),
  ('20260929110000', 'vendor_boutique_code_and_toggles'),
  ('20260929120000', 'notifications'),
  ('20261004100000', 'backfill_courier_cancelled_shipments'),
  ('20261004110000', 'vendor_verified_badge'),
  ('20261004120000', 'vendor_quality_tags'),
  ('20261004130000', 'product_ai_declaration'),
  ('20261004140000', 'product_ai_original_photos'),
  ('20261004150000', 'review_images_and_platform_settings'),
  ('20261004150100', 'fix_review_verified_purchase_cast'),
  ('20261004160000', 'return_evidence'),
  ('20261004170000', 'return_vendor_first_workflow'),
  ('20261004180000', 'product_video'),
  ('20261004180100', 'admin_guards_trust_service_role'),
  ('20261006100000', 'vendor_payout_schedule_on_delivery'),
  ('20261006100100', 'fix_pickup_cancelled_order_ref'),
  ('20261006110000', 'payout_lifecycle'),
  ('20261006110100', 'invoke_edge_function_timeout'),
  ('20261007100000', 'razorpay_route_payouts'),
  ('20261010100000', 'notification_deep_links'),
  ('20261010110000', 'email_otp_login'),
  ('20261010120000', 'product_cod_available'),
  ('20261010120100', 'fix_cod_guard_product_id_type'),
  ('20261010130000', 'vendor_registration_kyc'),
  ('20261010140000', 'customer_order_status_emails'),
  ('20261011090000', 'warehouse_staff_role'),
  ('20261011100000', 'warehouse_logistics'),
  ('20261012100000', 'order_status_and_return_window'),
  ('20261012110000', 'hsn_codes'),
  ('20261012120000', 'indian_states'),
  ('20261012130000', 'gst_tax_invoice'),
  ('20261012140000', 'customer_shipping_switch'),
  ('20261012150000', 'platform_rates'),
  ('20261012160000', 'founding_boutiques'),
  ('20261012170000', 'vendor_order_fees'),
  ('20261012180000', 'weekly_payouts'),
  ('20261012190000', 'fee_invoices'),
  ('20261012200000', 'statement_lines'),
  ('20261012210000', 'cod_remittance'),
  ('20261015100000', 'unpaid_online_orders'),
  ('20261015110000', 'product_customisation'),
  ('20261016100000', 'payout_after_return_window'),
  ('20261016110000', 'razorpayx_payouts'),
  ('20261016120000', 'payout_batch_uniqueness'),
  ('20261016130000', 'size_charts'),
  ('20261016140000', 'pause_razorpayx'),
  ('20261024100000', 'seller_form_part7'),
  ('20261024110000', 'vendor_pan_from_kyc'),
  ('20261024120000', 'warehouse_reads_products'),
  ('20261024130000', 'product_value_excl_gst'),
  ('20261025100000', 'inr_indian_commas'),
  ('20261025110000', 'size_charts_to_6xl'),
  ('20261025120000', 'customised_returns_24h'),
  ('20261025130000', 'unpaid_checkout_alert'),
  ('20261025140000', 'category_coupons'),
  ('20261025150000', 'seller_terms_consent'),
  ('20261025160000', 'pickup_address_rules'),
  ('20261025170000', 'statement_discount_shipping'),
  ('20261025180000', 'cod_charge_to_customer'),
  ('20261025190000', 'consent_at_sign_up')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Done. Next: STEP 2 (02_basic_settings.sql).
