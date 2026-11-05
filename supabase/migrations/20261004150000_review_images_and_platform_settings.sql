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
