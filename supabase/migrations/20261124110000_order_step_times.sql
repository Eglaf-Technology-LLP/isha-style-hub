-- The customer's order tracker shows every step with its date and time
-- (client, 24 Nov 2026): Order placed -> Confirmed by boutique -> Being
-- prepared by the boutique -> ... -> Out for delivery -> Delivered. Two of
-- those moments weren't kept anywhere: when the boutique accepted the order,
-- and when the courier took it out for delivery.
ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS out_for_delivery_at timestamptz;

COMMENT ON COLUMN public.vendor_orders.confirmed_at IS
  'When the boutique accepted this part (it left pending for anything but cancelled). Set by stamp_vendor_order_step_times.';
COMMENT ON COLUMN public.vendor_orders.out_for_delivery_at IS
  'When the courier first took this part out for delivery. Set by stamp_vendor_order_step_times.';

-- Parts accepted before this column: when admins were told "Boutique
-- confirmed an order" (notify_order_confirmed links to the part).
UPDATE public.vendor_orders vo
SET confirmed_at = n.first_at
FROM (
  SELECT substring(link_url FROM 'focus=([0-9a-f-]{36})')::uuid AS vendor_order_id, min(created_at) AS first_at
  FROM public.notifications
  WHERE type = 'order_confirmed' AND link_url LIKE '/admin?tab=orders&focus=%'
  GROUP BY 1
) n
WHERE vo.id = n.vendor_order_id
  AND vo.confirmed_at IS NULL
  AND vo.status NOT IN ('pending', 'cancelled');

-- Only this trigger sets the two times: they follow the status, and nobody
-- writes them by hand (a boutique's own session can update its parts).
CREATE OR REPLACE FUNCTION public.stamp_vendor_order_step_times()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.confirmed_at := OLD.confirmed_at;
  NEW.out_for_delivery_at := OLD.out_for_delivery_at;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status NOT IN ('pending', 'cancelled') AND NEW.confirmed_at IS NULL THEN
      NEW.confirmed_at := now();
    END IF;
    IF NEW.status = 'out_for_delivery' AND NEW.out_for_delivery_at IS NULL THEN
      NEW.out_for_delivery_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_vendor_order_step_times_trigger ON public.vendor_orders;
CREATE TRIGGER stamp_vendor_order_step_times_trigger
  BEFORE UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_vendor_order_step_times();
