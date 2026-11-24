-- The nightly clear-out of unused shop photos and videos on R2
-- (supabase/functions/media-cleanup), 03:00 India time. Its own migration
-- so it is switched on only after a dry run ({"dryRun": true}) was checked.
SELECT cron.schedule('media-cleanup', '30 21 * * *', $$SELECT public.invoke_edge_function('media-cleanup', '{}'::jsonb);$$);
