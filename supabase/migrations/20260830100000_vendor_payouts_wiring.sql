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
