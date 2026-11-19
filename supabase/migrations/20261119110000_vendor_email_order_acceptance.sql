-- Short-lived, single-use bearer tokens let a boutique accept one order from
-- its email without granting access to its dashboard or other order actions.
CREATE TABLE public.vendor_order_acceptance_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_order_id uuid NOT NULL UNIQUE REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
ALTER TABLE public.vendor_order_acceptance_tokens ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.vendor_order_acceptance_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.accept_vendor_order_from_email(_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.vendor_order_acceptance_tokens%ROWTYPE;
  v_order public.vendor_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_token
  FROM public.vendor_order_acceptance_tokens
  WHERE token_hash = _token_hash
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'invalid'); END IF;
  IF v_token.used_at IS NOT NULL THEN RETURN jsonb_build_object('result', 'already_used'); END IF;
  IF v_token.expires_at <= now() THEN RETURN jsonb_build_object('result', 'expired'); END IF;

  SELECT * INTO v_order FROM public.vendor_orders WHERE id = v_token.vendor_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'invalid'); END IF;
  IF v_order.status = 'confirmed' THEN
    UPDATE public.vendor_order_acceptance_tokens SET used_at = now() WHERE id = v_token.id;
    RETURN jsonb_build_object('result', 'already_accepted', 'vendor_order_id', v_order.id, 'order_id', v_order.order_id);
  END IF;
  IF v_order.status <> 'pending' THEN RETURN jsonb_build_object('result', 'not_pending'); END IF;

  UPDATE public.vendor_orders SET status = 'confirmed' WHERE id = v_order.id;
  UPDATE public.vendor_order_acceptance_tokens SET used_at = now() WHERE id = v_token.id;
  RETURN jsonb_build_object('result', 'accepted', 'vendor_order_id', v_order.id, 'order_id', v_order.order_id, 'vendor_id', v_order.vendor_id);
END;
$$;
REVOKE ALL ON FUNCTION public.accept_vendor_order_from_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_vendor_order_from_email(text) TO service_role;

-- The existing notify_order_confirmed trigger creates the admin bell entry.
-- This separate trigger delivers the matching email for either acceptance path.
CREATE OR REPLACE FUNCTION public.email_admins_on_vendor_order_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
    PERFORM public.invoke_edge_function('send-vendor-order-accepted-email', jsonb_build_object('vendorOrderId', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS email_admins_on_vendor_order_acceptance ON public.vendor_orders;
CREATE TRIGGER email_admins_on_vendor_order_acceptance
  AFTER UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.email_admins_on_vendor_order_acceptance();
