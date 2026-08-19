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
