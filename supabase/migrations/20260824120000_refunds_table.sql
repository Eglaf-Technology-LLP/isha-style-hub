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
