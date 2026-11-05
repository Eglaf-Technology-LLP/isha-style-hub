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
