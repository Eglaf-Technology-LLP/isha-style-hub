-- The admin-field guards checked only has_role(auth.uid(), 'admin'), so the
-- backend's own service-role key (auth.uid() is NULL) was treated like an
-- untrusted user: its writes to admin-only fields were silently reverted.
-- Any server-side job setting these would no-op. Trust service_role
-- explicitly (not "no user", which also covers anonymous requests).
CREATE OR REPLACE FUNCTION public.is_privileged_writer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.role() = 'service_role', false) OR public.has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_privileged_writer() THEN
      NEW.is_trusted := false;
      NEW.is_verified := false;
      NEW.commission_rate := 10;
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  NEW.boutique_code := OLD.boutique_code;

  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  NEW.is_trusted := OLD.is_trusted;
  NEW.is_verified := OLD.is_verified;
  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.owner_user_id := OLD.owner_user_id;

  IF NEW.payout_account_status <> 'pending' THEN
    NEW.payout_account_status := OLD.payout_account_status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_video_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_privileged boolean := public.is_privileged_writer();
  v_trusted boolean;
  v_changed boolean := TG_OP = 'INSERT' OR NEW.video_url IS DISTINCT FROM OLD.video_url;
BEGIN
  IF NEW.video_url IS NULL OR btrim(NEW.video_url) = '' THEN
    NEW.video_url := NULL;
    NEW.video_status := NULL;
    NEW.video_is_primary := false;
    RETURN NEW;
  END IF;

  -- Privileged writers may set the status explicitly; a new video they add
  -- without choosing one is approved.
  IF v_privileged THEN
    IF TG_OP = 'INSERT' THEN
      NEW.video_status := coalesce(NEW.video_status, 'approved');
    ELSIF v_changed AND NEW.video_status IS NOT DISTINCT FROM OLD.video_status THEN
      NEW.video_status := 'approved';
    END IF;
    RETURN NEW;
  END IF;

  IF v_changed THEN
    SELECT is_trusted INTO v_trusted FROM public.vendors WHERE id = NEW.vendor_id;
    NEW.video_status := CASE WHEN coalesce(v_trusted, false) THEN 'approved' ELSE 'pending' END;
  ELSE
    NEW.video_status := OLD.video_status;
  END IF;
  RETURN NEW;
END;
$$;
