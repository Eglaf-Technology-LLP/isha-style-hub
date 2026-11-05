-- Automatic boutique payouts through Razorpay Route.
--   * Each boutique is a Razorpay linked account (created from its bank
--     details + PAN; Razorpay verifies the bank account).
--   * Online orders: when the payment is captured, the boutique's share
--     (net_payable, after commission) is transferred to its linked account
--     ON HOLD. After delivery + return window it's released, and Razorpay
--     settles it to the boutique's bank (settlement UTR via webhook).
--   * COD orders: on the payout date a direct transfer is made from the
--     platform's Razorpay balance.
--   * Refunds before release reverse the boutique's share first.
-- The manual admin payout runs (vendor_payouts) stay only as a fallback.

ALTER TABLE public.vendor_payout_accounts
  ADD COLUMN IF NOT EXISTS pan text,
  ADD COLUMN IF NOT EXISTS legal_business_name text,
  ADD COLUMN IF NOT EXISTS razorpay_status text NOT NULL DEFAULT 'not_created'
    CHECK (razorpay_status IN ('not_created', 'created', 'under_review', 'needs_clarification', 'activated', 'failed')),
  ADD COLUMN IF NOT EXISTS razorpay_product_id text,
  ADD COLUMN IF NOT EXISTS razorpay_requirements jsonb,
  ADD COLUMN IF NOT EXISTS razorpay_error text,
  ADD COLUMN IF NOT EXISTS razorpay_synced_at timestamptz;

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS rzp_transfer_id text,
  ADD COLUMN IF NOT EXISTS rzp_transfer_kind text CHECK (rzp_transfer_kind IN ('payment', 'direct')),
  ADD COLUMN IF NOT EXISTS rzp_transfer_status text
    CHECK (rzp_transfer_status IN ('held', 'released', 'failed', 'reversed')),
  ADD COLUMN IF NOT EXISTS rzp_transfer_amount numeric,
  ADD COLUMN IF NOT EXISTS rzp_reversed_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rzp_transfer_error text,
  ADD COLUMN IF NOT EXISTS rzp_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS rzp_settlement_id text,
  ADD COLUMN IF NOT EXISTS rzp_settlement_utr text,
  ADD COLUMN IF NOT EXISTS rzp_settled_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_orders_rzp_transfer_id
  ON public.vendor_orders(rzp_transfer_id) WHERE rzp_transfer_id IS NOT NULL;

-- Boutiques edit their own bank details, but the Razorpay linkage and
-- verification state only ever come from our server (onboarding function /
-- webhooks) - otherwise a boutique could point its payouts at another
-- linked account or mark itself verified.
CREATE OR REPLACE FUNCTION public.protect_payout_account_razorpay_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.razorpay_account_id := NULL;
    NEW.razorpay_status := 'not_created';
    NEW.razorpay_product_id := NULL;
    NEW.razorpay_requirements := NULL;
    NEW.razorpay_error := NULL;
    NEW.razorpay_synced_at := NULL;
  ELSE
    NEW.razorpay_account_id := OLD.razorpay_account_id;
    NEW.razorpay_status := OLD.razorpay_status;
    NEW.razorpay_product_id := OLD.razorpay_product_id;
    NEW.razorpay_requirements := OLD.razorpay_requirements;
    NEW.razorpay_error := OLD.razorpay_error;
    NEW.razorpay_synced_at := OLD.razorpay_synced_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_payout_account_razorpay_fields_trigger ON public.vendor_payout_accounts;
CREATE TRIGGER protect_payout_account_razorpay_fields_trigger
  BEFORE INSERT OR UPDATE ON public.vendor_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_payout_account_razorpay_fields();

-- Same for money fields on vendor orders: boutiques may update their order
-- status, never the payout date or transfer state.
CREATE OR REPLACE FUNCTION public.protect_vendor_order_payout_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  -- Delivery now releases real money automatically, so order status may
  -- only change through the courier webhook / server functions / admins -
  -- never directly from a boutique's session (no app screen does this).
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Order status is updated by the courier and AllBoutiqs, not directly';
  END IF;
  -- stamp_vendor_order_delivery (runs after this) recomputes the payout
  -- date from a server-side delivered_at, so a boutique can't backdate it.
  NEW.payout_id := OLD.payout_id;
  NEW.payout_eligible_on := OLD.payout_eligible_on;
  NEW.delivered_at := OLD.delivered_at;
  NEW.due_notified_at := OLD.due_notified_at;
  NEW.payout_notified_at := OLD.payout_notified_at;
  NEW.rzp_transfer_id := OLD.rzp_transfer_id;
  NEW.rzp_transfer_kind := OLD.rzp_transfer_kind;
  NEW.rzp_transfer_status := OLD.rzp_transfer_status;
  NEW.rzp_transfer_amount := OLD.rzp_transfer_amount;
  NEW.rzp_reversed_amount := OLD.rzp_reversed_amount;
  NEW.rzp_transfer_error := OLD.rzp_transfer_error;
  NEW.rzp_released_at := OLD.rzp_released_at;
  NEW.rzp_settlement_id := OLD.rzp_settlement_id;
  NEW.rzp_settlement_utr := OLD.rzp_settlement_utr;
  NEW.rzp_settled_at := OLD.rzp_settled_at;
  RETURN NEW;
END;
$$;

-- Runs before stamp_vendor_order_delivery (alphabetical order of BEFORE
-- triggers), so a status change still gets its payout date computed.
DROP TRIGGER IF EXISTS a_protect_vendor_order_payout_fields_trigger ON public.vendor_orders;
CREATE TRIGGER a_protect_vendor_order_payout_fields_trigger
  BEFORE UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_vendor_order_payout_fields();

-- Daily 10:00 IST: release payouts whose date has arrived (after the 09:00
-- queue/notification job) through the razorpay-route-release function.
SELECT cron.schedule(
  'razorpay-route-release',
  '30 4 * * *',
  $$SELECT public.invoke_edge_function('razorpay-route-release', '{}'::jsonb);$$
);
