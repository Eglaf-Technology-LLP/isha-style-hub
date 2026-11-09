-- Boutique payouts by hand, every week (2026-11-10). Razorpay's automatic
-- payouts (RazorpayX / Route) need conditions AllBoutiqs doesn't meet, so
-- every payout is a bank transfer an admin makes (payout_rail stays 'manual'):
--   1. Each payout day (the admins' rates: Wednesday, 9:30 AM) the ready
--      orders - delivered, return window closed, money in - are batched into
--      one payout per boutique, with every charge already taken off, and the
--      admins are told. "Prepare ready payouts" does the same any time.
--   2. An admin transfers each amount from the bank (online or at the
--      branch), uploads the proof and marks it paid with the UTR.
--   3. The boutique is emailed and notified (vendor_payout_events) and sees
--      the payout, its charges and the proof on its dashboard.

ALTER TABLE public.vendor_payouts
  ADD COLUMN IF NOT EXISTS payment_proof_path text;

-- Proof files: payout-proofs/<vendor id>/<payout id>/<file>. Admins upload
-- and read them; the boutique's members read their own.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payout-proofs', 'payout-proofs', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins upload payout proofs" ON storage.objects;
CREATE POLICY "Admins upload payout proofs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payout-proofs' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Payout proofs readable by admins and the boutique" ON storage.objects;
CREATE POLICY "Payout proofs readable by admins and the boutique" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payout-proofs'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.vendors v
        WHERE v.id::text = (storage.foldername(objects.name))[1] AND public.is_vendor_member(auth.uid(), v.id)
      )
    )
  );

-- A hand-made transfer is marked paid only with its UTR and its proof.
CREATE OR REPLACE FUNCTION public.guard_vendor_payout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.bank_account_last4 := coalesce(NEW.bank_account_last4, public.vendor_bank_last4(NEW.vendor_id));
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'This payout is already %', CASE OLD.status WHEN 'paid' THEN 'credited' ELSE 'declined' END;
  END IF;

  IF NEW.status = 'paid' THEN
    IF coalesce(btrim(NEW.payment_reference), '') = '' THEN
      RAISE EXCEPTION 'Enter the bank transfer reference (UTR) to mark this payout credited';
    END IF;
    IF NEW.method IS DISTINCT FROM 'razorpayx' THEN
      IF coalesce(btrim(NEW.payment_proof_path), '') = '' THEN
        RAISE EXCEPTION 'Upload the proof of the bank transfer to mark this payout paid';
      END IF;
      IF split_part(NEW.payment_proof_path, '/', 1) IS DISTINCT FROM NEW.vendor_id::text THEN
        RAISE EXCEPTION 'That proof was uploaded for another boutique';
      END IF;
    END IF;
    NEW.paid_at := coalesce(NEW.paid_at, now());
    NEW.bank_account_last4 := coalesce(public.vendor_bank_last4(NEW.vendor_id), NEW.bank_account_last4);
    NEW.failure_reason := NULL;
  ELSIF NEW.status = 'failed' THEN
    IF coalesce(btrim(NEW.failure_reason), '') = '' THEN
      RAISE EXCEPTION 'Enter why the bank declined the transfer';
    END IF;
    NEW.failed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- The weekly payout day for hand-made transfers: on the payout weekday batch
-- the ready orders and tell the admins what to transfer. Does nothing while
-- RazorpayX sends the payouts (it has its own job, razorpayx-payout-day).
CREATE OR REPLACE FUNCTION public.manual_payout_day()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_payouts integer;
  v_total numeric;
  v_waiting text[] := '{}';
  v_body text;
BEGIN
  IF (SELECT payout_rail FROM public.platform_settings WHERE id) IS DISTINCT FROM 'manual' THEN
    RETURN 0;
  END IF;
  IF extract(isodow FROM now() AT TIME ZONE 'Asia/Kolkata')::integer <> (public.rates_on(now())).payout_weekday THEN
    RETURN 0;
  END IF;

  -- prepare_vendor_payouts is for admins or the service role.
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  FOR r IN SELECT * FROM public.prepare_vendor_payouts() LOOP
    IF r.payout_id IS NULL THEN
      v_waiting := v_waiting || format('%s (%s)', r.vendor_name, r.skipped_reason);
    END IF;
  END LOOP;

  -- Everything still to transfer, including any earlier batch not paid yet.
  SELECT count(*), coalesce(sum(net_payable), 0) INTO v_payouts, v_total
  FROM public.vendor_payouts WHERE status = 'pending';

  IF v_payouts = 0 AND cardinality(v_waiting) = 0 THEN
    RETURN 0;
  END IF;
  v_body := CASE WHEN v_payouts > 0
    THEN format('%s payout(s) totalling %s to transfer today. Pay each from the bank, then upload the proof and mark it paid.',
                v_payouts, public.inr(v_total))
    ELSE 'No payouts to transfer today.' END;
  IF cardinality(v_waiting) > 0 THEN
    v_body := v_body || ' Not included: ' || array_to_string(v_waiting, ', ') || '.';
  END IF;
  PERFORM public.notify_admins('other', 'payouts_ready', 'Boutique payouts to transfer', v_body,
    public.nlink('/admin', 'vendor-payouts', NULL));
  RETURN v_payouts;
END;
$$;
REVOKE ALL ON FUNCTION public.manual_payout_day() FROM public, anon, authenticated;

-- 04:00 UTC = 9:30 AM IST, every day; it acts only on the payout weekday.
SELECT cron.schedule('manual-payout-day', '0 4 * * *', $$SELECT public.manual_payout_day()$$);
