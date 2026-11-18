-- Home page hero carousel (the first, full-width card on the home page),
-- edited by admins under Admin > Home Banner. Any number of slides; shoppers
-- see the active ones whose schedule (if any) covers now, in `position` order.
--
-- A slide needs a title, an image or a video. A primary link without a
-- button label makes the whole slide clickable (for banners whose text is
-- already in the picture); the secondary button needs both label and link.

CREATE TABLE IF NOT EXISTS public.hero_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  eyebrow text,
  title text,
  title_accent text,
  subtitle text,
  cta_label text,
  cta_href text,
  secondary_cta_label text,
  secondary_cta_href text,
  image_url text,
  mobile_image_url text,
  video_url text,
  align text NOT NULL DEFAULT 'left',
  show_overlay boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hero_slides_align_check CHECK (align IN ('left', 'center')),
  CONSTRAINT hero_slides_has_content CHECK (
    nullif(btrim(title), '') IS NOT NULL OR nullif(btrim(image_url), '') IS NOT NULL OR nullif(btrim(video_url), '') IS NOT NULL
  ),
  CONSTRAINT hero_slides_cta_needs_link CHECK (nullif(btrim(cta_label), '') IS NULL OR nullif(btrim(cta_href), '') IS NOT NULL),
  CONSTRAINT hero_slides_secondary_cta_pair CHECK (
    (nullif(btrim(secondary_cta_label), '') IS NULL) = (nullif(btrim(secondary_cta_href), '') IS NULL)
  ),
  CONSTRAINT hero_slides_window_check CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_hero_slides_position ON public.hero_slides (position);

ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view live hero slides" ON public.hero_slides;
CREATE POLICY "Anyone can view live hero slides"
  ON public.hero_slides FOR SELECT
  TO anon, authenticated
  USING (
    is_active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

DROP POLICY IF EXISTS "Admins manage hero slides" ON public.hero_slides;
CREATE POLICY "Admins manage hero slides"
  ON public.hero_slides FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_hero_slides_updated_at ON public.hero_slides;
CREATE TRIGGER update_hero_slides_updated_at
  BEFORE UPDATE ON public.hero_slides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The three slides the home page showed until now (src/content/storefront.ts),
-- so nothing changes for shoppers until an admin edits them. Only when the
-- table is empty, so a re-run never duplicates them.
INSERT INTO public.hero_slides
  (position, eyebrow, title, title_accent, subtitle, cta_label, cta_href, secondary_cta_label, secondary_cta_href, image_url, align)
SELECT * FROM (VALUES
  (1, 'The Wedding Edit', 'Heirlooms in the making,', 'for your big day',
   'Bridal lehengas and festive sarees, hand-picked from India''s finest boutiques.',
   'Shop the edit', '/category/lehenga', 'Explore sarees', '/category/sarees', '/hero/hero-fashion.jpg', 'left'),
  (2, 'One address', 'India''s boutiques,', 'under one roof',
   'Ethnic, western and party wear from India''s best boutiques and designer brands.',
   'Meet the boutiques', '/boutiques', 'New in', '/category/all?sort=newest', NULL, 'center'),
  (3, 'Made for you', 'Crafted to order,', 'finished by hand',
   'Pieces made the moment you order them - and checked at our quality centre before they reach you.',
   'Shop made to order', '/category/all?availability=made-to-order', NULL, NULL, NULL, 'center')
) AS v(position, eyebrow, title, title_accent, subtitle, cta_label, cta_href, secondary_cta_label, secondary_cta_href, image_url, align)
WHERE NOT EXISTS (SELECT 1 FROM public.hero_slides);
