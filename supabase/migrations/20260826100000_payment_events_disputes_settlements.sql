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
