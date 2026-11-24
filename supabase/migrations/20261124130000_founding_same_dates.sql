-- Every Founding Boutique has the same 0% commission dates, set by the
-- system: 29 Nov 2026 to 28 Jan 2027 (platform_settings.founding_from /
-- founding_until), then the normal commission - 10% - on its own (client
-- corrections Part 2, A15.1: Organzza showed "0% until 2027-01-29", House Of
-- Twinkle "0% until 2026-12-15", from each boutique's own extra period).
--
-- A boutique's own period (vendors.founding_from / founding_until) no longer
-- counts for new orders, and no screen shows or sets it any more. Orders
-- placed before 24 Nov 2026 keep the 0% they were priced with (the user's
-- choice, 24 Nov 2026): the dates stay in the table for them, so a later
-- re-pricing (a cancel or a return) gives the same commission.

CREATE OR REPLACE FUNCTION public.effective_commission_pct(_vendor_id uuid, _at timestamp with time zone)
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
    -- Before 24 Nov 2026 only: the boutique's own 0% dates of that time.
    WHEN v.is_founding AND v.founding_from IS NOT NULL AND v.founding_until IS NOT NULL
     AND d.day < DATE '2026-11-24'
     AND d.day BETWEEN v.founding_from AND v.founding_until
    THEN 0
    ELSE coalesce(v.commission_rate, (public.rates_on(_at)).marketplace_commission_pct)
  END
  FROM public.vendors v
  CROSS JOIN d
  LEFT JOIN public.platform_settings ps ON ps.id
  WHERE v.id = _vendor_id;
$$;
