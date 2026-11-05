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
