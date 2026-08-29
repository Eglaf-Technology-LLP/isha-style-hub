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
