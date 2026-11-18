-- Founding period for every boutique (client corrections, 15 Nov 2026,
-- point 1.6.2): 0% marketplace commission on orders placed from 29 Nov 2026
-- to 28 Jan 2027 (IST, both days included), then the platform rate (10%).
--
-- Until now the 0% was set boutique by boutique (vendors.is_founding with
-- its own dates), from a launch date of 15 Oct and a "2 months" preset that
-- ended a day late (29 Jan). The period now lives once, here, and applies
-- to all boutiques, including any with their own commission override.
-- A boutique's own founding dates still work, for an extra 0% period.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS founding_from date,
  ADD COLUMN IF NOT EXISTS founding_until date;

ALTER TABLE public.platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_founding_period_check;
ALTER TABLE public.platform_settings
  ADD CONSTRAINT platform_settings_founding_period_check
    CHECK (founding_from IS NULL OR founding_until IS NULL OR founding_until >= founding_from);

COMMENT ON COLUMN public.platform_settings.founding_from IS
  'First day (IST) of the founding period: 0% marketplace commission for every boutique.';
COMMENT ON COLUMN public.platform_settings.founding_until IS
  'Last day (IST, included) of the founding period.';

-- Launch on 29 Nov 2026 (was 15 Oct); founding period 29 Nov - 28 Jan.
UPDATE public.platform_settings
SET founding_from = '2026-11-29',
    founding_until = '2027-01-28',
    launch_date = '2026-11-29';

-- Commission % for a boutique on a date (order time, IST):
--   0 inside the founding period (every boutique),
--   0 inside the boutique's own founding period (both dates set),
--   else its own override, else the platform rate in force.
-- A boutique's own period now needs both dates: is_founding alone is just
-- the badge. (Every founding boutique so far has both dates.)
CREATE OR REPLACE FUNCTION public.effective_commission_pct(_vendor_id uuid, _at timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH d AS (SELECT (_at AT TIME ZONE 'Asia/Kolkata')::date AS day)
  SELECT CASE
    WHEN ps.founding_from IS NOT NULL AND ps.founding_until IS NOT NULL
     AND d.day BETWEEN ps.founding_from AND ps.founding_until
    THEN 0
    WHEN v.is_founding AND v.founding_from IS NOT NULL AND v.founding_until IS NOT NULL
     AND d.day BETWEEN v.founding_from AND v.founding_until
    THEN 0
    ELSE coalesce(v.commission_rate, (public.rates_on(_at)).marketplace_commission_pct)
  END
  FROM public.vendors v
  CROSS JOIN d
  LEFT JOIN public.platform_settings ps ON ps.id
  WHERE v.id = _vendor_id;
$$;
