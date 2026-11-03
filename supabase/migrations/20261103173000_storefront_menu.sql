-- Go-live audit (3 Nov): the header and footer on every page (404, account
-- and checkout included) downloaded the whole live catalogue with variants
-- just to build the menu. They now read this summary instead - one row per
-- category and boutique with live products, a few rows in all.
--
-- Same rows a shopper can see (security invoker: the products RLS applies).
-- cover: the newest photo in the category, a stand-in until an admin uploads
-- the category's own image (categoryCover in src/hooks/useStorefront.ts).
CREATE OR REPLACE FUNCTION public.storefront_menu()
RETURNS TABLE (category_id uuid, vendor_id uuid, products integer, on_sale boolean, cover text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH live AS (
    SELECT p.category_id, p.vendor_id, p.price, p.compare_at_price, p.images, p.created_at
    FROM public.products p
    WHERE p.is_active AND p.approval_status = 'approved'
  ),
  covers AS (
    SELECT DISTINCT ON (l.category_id) l.category_id, l.images[1] AS cover
    FROM live l
    WHERE l.category_id IS NOT NULL AND coalesce(l.images[1], '') <> ''
    ORDER BY l.category_id, l.created_at DESC
  )
  SELECT l.category_id, l.vendor_id, count(*)::integer,
         coalesce(bool_or(l.compare_at_price > l.price), false), c.cover
  FROM live l
  LEFT JOIN covers c ON c.category_id = l.category_id
  GROUP BY l.category_id, l.vendor_id, c.cover;
$$;

REVOKE ALL ON FUNCTION public.storefront_menu() FROM public;
GRANT EXECUTE ON FUNCTION public.storefront_menu() TO anon, authenticated, service_role;
