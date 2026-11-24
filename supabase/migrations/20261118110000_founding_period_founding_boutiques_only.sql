-- Founding period for Founding Boutiques only (client corrections Part 2,
-- 18 Nov 2026, A15.1 / A18.1): "every Founding Boutique 0% from 29 Nov 2026
-- to 28 Jan 2027, then 10% automatically"; a boutique that is not a Founding
-- Boutique pays the normal commission (10%) and the technology & service fee.
--
-- 20261116130000 gave the platform founding period (platform_settings
-- founding_from / founding_until) to every boutique. It now needs
-- vendors.is_founding. A Founding Boutique's own dates (both set) still give
-- an extra 0% period. The period starts on 29 Nov 2026, so no order placed
-- before this change is inside it - no fee already worked out changes.

COMMENT ON COLUMN public.platform_settings.founding_from IS
  'First day (IST) of the founding period: 0% marketplace commission for every Founding Boutique (vendors.is_founding).';
COMMENT ON COLUMN public.platform_settings.founding_until IS
  'Last day (IST, included) of the founding period.';

-- Commission % for a boutique on a date (order time, IST):
--   0 for a Founding Boutique inside the founding period,
--   0 for a Founding Boutique inside its own extra period (both dates set),
--   else its own override, else the platform rate in force.
CREATE OR REPLACE FUNCTION public.effective_commission_pct(_vendor_id uuid, _at timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH d AS (SELECT (_at AT TIME ZONE 'Asia/Kolkata')::date AS day)
  SELECT CASE
    WHEN v.is_founding AND ps.founding_from IS NOT NULL AND ps.founding_until IS NOT NULL
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
