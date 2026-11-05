-- Size charts (Developer Corrections Part 8, 40): every chart has XS to
-- 6XL, and opens pre-filled with AllBoutiqs' starting values in inches
-- (bust / waist / hip), which each boutique changes to its own:
--   XS 32/26/36 · S 34/28/38 · M 36/30/40 · L 38/32/42 · XL 40/34/44
--   XXL 42/36/46 · 3XL 44/38/48 · 4XL 46/40/50 · 5XL 48/42/52 · 6XL 50/44/54
-- The saree chart is named for what it measures: "Saree Blouse".
WITH sizes(size, bust, waist, hip, ord) AS (
  VALUES ('XS', 32, 26, 36, 1), ('S', 34, 28, 38, 2), ('M', 36, 30, 40, 3), ('L', 38, 32, 42, 4),
         ('XL', 40, 34, 44, 5), ('XXL', 42, 36, 46, 6), ('3XL', 44, 38, 48, 7), ('4XL', 46, 40, 50, 8),
         ('5XL', 48, 42, 52, 9), ('6XL', 50, 44, 54, 10)
),
starting AS (
  SELECT jsonb_object_agg(size, bust::text) AS bust,
         jsonb_object_agg(size, waist::text) AS waist,
         jsonb_object_agg(size, hip::text) AS hip,
         jsonb_agg(size ORDER BY ord) AS all_sizes
  FROM sizes
)
UPDATE public.size_guides g
SET sizes = s.all_sizes,
    name = CASE lower(g.name) WHEN 'saree blouse' THEN 'Saree Blouse' WHEN 'western wear' THEN 'Western Wear' ELSE g.name END,
    measurements = (
      SELECT jsonb_agg(
               CASE m->>'key'
                 WHEN 'bust' THEN m || jsonb_build_object('values', s.bust)
                 WHEN 'waist' THEN m || jsonb_build_object('values', s.waist)
                 WHEN 'hip' THEN m || jsonb_build_object('values', s.hip)
                 ELSE m
               END ORDER BY x.ord)
      FROM jsonb_array_elements(g.measurements) WITH ORDINALITY AS x(m, ord)
    ),
    updated_at = now()
FROM starting s;
