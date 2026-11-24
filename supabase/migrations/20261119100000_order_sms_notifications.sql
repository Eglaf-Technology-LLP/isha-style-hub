-- DLT based order SMS. The provider/template credentials stay in Edge Function
-- Secrets; this table is an admin-only delivery/audit log.
CREATE TABLE public.order_sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_order_id uuid REFERENCES public.vendor_orders(id) ON DELETE SET NULL,
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN ('placed','shipped','delivered','cancelled','return')),
  audience text NOT NULL CHECK (audience IN ('customer','boutique','admin')),
  phone text NOT NULL DEFAULT '',
  template_id text,
  message_body text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','failed')),
  provider_message_id text,
  provider_response jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);
CREATE INDEX order_sms_logs_order_created_idx ON public.order_sms_logs(order_id, created_at DESC);
ALTER TABLE public.order_sms_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view order SMS logs" ON public.order_sms_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.order_sms_logs TO authenticated;
GRANT ALL ON public.order_sms_logs TO service_role;

CREATE OR REPLACE FUNCTION public.queue_order_sms(_order_id uuid, _event text, _vendor_order_id uuid DEFAULT NULL, _return_request_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.invoke_edge_function('send-order-sms', jsonb_strip_nulls(jsonb_build_object(
    'orderId', _order_id, 'event', _event, 'vendorOrderId', _vendor_order_id, 'returnRequestId', _return_request_id
  )));
END;
$$;
REVOKE ALL ON FUNCTION public.queue_order_sms(uuid, text, uuid, uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.order_sms_on_placed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.payment_method = 'cod' OR NEW.payment_status = 'paid')
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    PERFORM public.queue_order_sms(NEW.id, 'placed');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_sms_placed_insert ON public.orders;
CREATE TRIGGER order_sms_placed_insert AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.order_sms_on_placed();
DROP TRIGGER IF EXISTS order_sms_placed_paid ON public.orders;
CREATE TRIGGER order_sms_placed_paid AFTER UPDATE OF payment_status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.order_sms_on_placed();

CREATE OR REPLACE FUNCTION public.order_sms_on_vendor_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'shipped' THEN PERFORM public.queue_order_sms(NEW.order_id, 'shipped', NEW.id);
  ELSIF NEW.status = 'delivered' THEN PERFORM public.queue_order_sms(NEW.order_id, 'delivered', NEW.id);
  ELSIF NEW.status = 'returned' THEN PERFORM public.queue_order_sms(NEW.order_id, 'return', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_sms_vendor_status ON public.vendor_orders;
CREATE TRIGGER order_sms_vendor_status AFTER UPDATE OF status ON public.vendor_orders FOR EACH ROW EXECUTE FUNCTION public.order_sms_on_vendor_status();

-- The admin order status control can be used without changing a vendor part.
-- Cover that manual path while avoiding duplicate notices for derived states.
CREATE OR REPLACE FUNCTION public.order_sms_on_manual_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_status IS NOT DISTINCT FROM OLD.order_status THEN RETURN NEW; END IF;
  IF NEW.order_status = 'shipped' AND NOT EXISTS (SELECT 1 FROM public.vendor_orders WHERE order_id = NEW.id AND status IN ('shipped','delivered','returned')) THEN
    PERFORM public.queue_order_sms(NEW.id, 'shipped');
  ELSIF NEW.order_status = 'delivered' AND NOT EXISTS (SELECT 1 FROM public.vendor_orders WHERE order_id = NEW.id AND status = 'delivered') THEN
    PERFORM public.queue_order_sms(NEW.id, 'delivered');
  ELSIF NEW.order_status = 'cancelled' AND NEW.payment_status IN ('paid','refunded') AND NOT EXISTS (SELECT 1 FROM public.order_cancellations WHERE order_id = NEW.id) THEN
    PERFORM public.queue_order_sms(NEW.id, 'cancelled');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_sms_manual_status ON public.orders;
CREATE TRIGGER order_sms_manual_status AFTER UPDATE OF order_status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.order_sms_on_manual_status();

CREATE OR REPLACE FUNCTION public.order_sms_on_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.queue_order_sms(NEW.order_id, 'cancelled', NEW.vendor_order_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_sms_cancellation ON public.order_cancellations;
CREATE TRIGGER order_sms_cancellation AFTER INSERT ON public.order_cancellations FOR EACH ROW EXECUTE FUNCTION public.order_sms_on_cancellation();

CREATE OR REPLACE FUNCTION public.order_sms_on_return()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.queue_order_sms(NEW.order_id, 'return', NULL, NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_sms_return ON public.return_requests;
CREATE TRIGGER order_sms_return AFTER INSERT ON public.return_requests FOR EACH ROW EXECUTE FUNCTION public.order_sms_on_return();
