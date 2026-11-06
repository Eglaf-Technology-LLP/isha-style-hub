-- ROLLBACK for 20261103150000_server_side_order_prices.sql
-- Puts order saving back the way it was before (browser-sent amounts).
-- Use ONLY if the new checkout misbehaves and the website must keep taking
-- orders; redeploy the old create-razorpay-order and shiprocket-cod-charge
-- from Live-Vendor and the old website at the same time.

DROP TRIGGER IF EXISTS price_orders_from_items_trigger ON public.order_items;
DROP TRIGGER IF EXISTS price_order_item_trigger ON public.order_items;
DROP TRIGGER IF EXISTS guard_new_vendor_order_trigger ON public.vendor_orders;
DROP FUNCTION IF EXISTS public.price_orders_from_items();
DROP FUNCTION IF EXISTS public.price_order_item();
DROP FUNCTION IF EXISTS public.price_order(uuid);
DROP FUNCTION IF EXISTS public.guard_new_vendor_order();
SELECT cron.unschedule('purge-cod-charge-quotes')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-cod-charge-quotes');
-- cod_charge_quotes is left in place (harmless, emptied by nothing once the
-- job is gone); drop it with: DROP TABLE IF EXISTS public.cod_charge_quotes;

-- The two guards as they were (from 20261102100000_customer_wallet.sql):
CREATE OR REPLACE FUNCTION public.guard_new_order_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.payment_status := 'pending';
    NEW.order_status := 'pending';
    NEW.wallet_amount := 0;
    NEW.razorpay_payment_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_new_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.payment_status := 'pending';
    NEW.transaction_id := NULL;
    NEW.refund_amount := 0;
  END IF;
  RETURN NEW;
END;
$$;
