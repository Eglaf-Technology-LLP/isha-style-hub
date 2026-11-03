-- Go-live audit (3 Nov): the shop's snapshot - see
-- supabase/functions/storefront-snapshot. A public bucket for its two files
-- (read through the CDN by every shopper; only the server writes - no
-- storage policies, the service role needs none), refreshed every minute.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('storefront', 'storefront', true, 52428800, ARRAY['application/json'])
ON CONFLICT (id) DO NOTHING;

SELECT cron.schedule('storefront-snapshot', '* * * * *', $$SELECT public.invoke_edge_function('storefront-snapshot', '{}'::jsonb);$$);
