-- Client changes of 2026-11-13.
--
-- 1. Photos and video in the order the boutique / admin arranges them.
--    products.images already keeps the photos' order. video_position is how
--    many photos come before the video: 0 = the video is shown first (the
--    same as video_is_primary, which the forms keep in step), NULL = after
--    the last photo.
-- 2. A variant can have several photos, in order. product_variants.images
--    holds them all; image_url stays the first one, so everything that reads
--    image_url (order lines, invoices, the warehouse) keeps working.
-- 3. Admins choose which categories are links in the site header and which
--    are tiles on the home page. Every category is still in the listing
--    page's category filter. Existing categories keep showing in both, as
--    they do today; new ones start off in neither.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS video_position integer CHECK (video_position IS NULL OR video_position >= 0);

UPDATE public.products SET video_position = 0 WHERE video_is_primary AND video_position IS NULL;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}';

UPDATE public.product_variants
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL AND image_url <> '' AND images = '{}';

-- Added as true so the categories there now keep showing; then new ones
-- default to false.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS show_in_header boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_on_home boolean NOT NULL DEFAULT true;
ALTER TABLE public.categories
  ALTER COLUMN show_in_header SET DEFAULT false,
  ALTER COLUMN show_on_home SET DEFAULT false;
