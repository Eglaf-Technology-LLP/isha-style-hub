-- Optional product video. Shown to shoppers only once approved: either as
-- the first/front media (video_is_primary) or, when an image leads, as a
-- compact highlight frame over it.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS video_is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_status text
    CHECK (video_status IN ('pending', 'approved', 'rejected'));

-- Approval is decided here, never by the client: admins' and trusted
-- partners' videos are approved (same rule as their listings publishing
-- instantly); everyone else's wait for admin review. Non-admins can't set
-- the status directly.
CREATE OR REPLACE FUNCTION public.set_product_video_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := public.has_role(auth.uid(), 'admin');
  v_trusted boolean;
  v_changed boolean := TG_OP = 'INSERT' OR NEW.video_url IS DISTINCT FROM OLD.video_url;
BEGIN
  IF NEW.video_url IS NULL OR btrim(NEW.video_url) = '' THEN
    NEW.video_url := NULL;
    NEW.video_status := NULL;
    NEW.video_is_primary := false;
    RETURN NEW;
  END IF;

  IF v_is_admin THEN
    IF v_changed AND (TG_OP = 'INSERT' OR NEW.video_status IS NOT DISTINCT FROM OLD.video_status) THEN
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

CREATE TRIGGER set_product_video_status_trigger
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_product_video_status();
