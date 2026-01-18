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