-- Return/exchange evidence: several photos per item (items[].photo_urls,
-- with items[].photo_url kept as the first for older rows/readers) plus one
-- optional video per request. Admins choose whether photo evidence is
-- mandatory; default true matches the previous always-required behaviour.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS return_evidence_required boolean NOT NULL DEFAULT true;

ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS evidence_video_url text;

-- The form enforces this too; this stops a direct API insert skipping it.
CREATE OR REPLACE FUNCTION public.enforce_return_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF (SELECT return_evidence_required FROM public.platform_settings WHERE id)
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) AS it
       WHERE coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(it->'photo_urls') = 'array' THEN it->'photo_urls' END), 0) = 0
         AND coalesce(it->>'photo_url', '') = ''
     ) THEN
    RAISE EXCEPTION 'Photo evidence is required for every item in a return or exchange request'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_return_evidence_trigger
  BEFORE INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_return_evidence();
