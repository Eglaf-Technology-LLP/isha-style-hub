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
