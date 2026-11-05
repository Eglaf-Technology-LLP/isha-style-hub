-- Rupee amounts in notifications with Indian commas (Developer Corrections
-- Part 8, 12): ₹14,160 and ₹12,34,567.50 - paise only when there are any,
-- the same as the site's formatINR. Was '₹14160', rounded to the rupee.
CREATE OR REPLACE FUNCTION public.inr(_amount numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v numeric := round(coalesce(_amount, 0), 2);
  neg boolean := v < 0;
  whole text;
  paise text;
BEGIN
  v := abs(v);
  whole := trunc(v)::text;
  paise := lpad(round((v - trunc(v)) * 100)::int::text, 2, '0');
  IF length(whole) > 3 THEN
    whole := regexp_replace(left(whole, length(whole) - 3), '(\d)(?=(\d\d)+$)', '\1,', 'g') || ',' || right(whole, 3);
  END IF;
  RETURN CASE WHEN neg THEN '-' ELSE '' END || '₹' || whole || CASE WHEN paise = '00' THEN '' ELSE '.' || paise END;
END;
$$;
