-- Indian states/UTs with GST state codes (invoice step 3). Addresses now
-- pick the state from a dropdown (src/lib/indianStates.ts mirrors this);
-- gst_state_code() also understands older free-text spellings, so the
-- invoice can compare the boutique's state with the delivery state.

CREATE TABLE IF NOT EXISTS public.indian_states (
  name text PRIMARY KEY,
  gst_code text NOT NULL UNIQUE CHECK (gst_code ~ '^[0-9]{2}$')
);
ALTER TABLE public.indian_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read states" ON public.indian_states FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.indian_states (name, gst_code) VALUES
  ('Jammu and Kashmir', '01'), ('Himachal Pradesh', '02'), ('Punjab', '03'), ('Chandigarh', '04'),
  ('Uttarakhand', '05'), ('Haryana', '06'), ('Delhi', '07'), ('Rajasthan', '08'), ('Uttar Pradesh', '09'),
  ('Bihar', '10'), ('Sikkim', '11'), ('Arunachal Pradesh', '12'), ('Nagaland', '13'), ('Manipur', '14'),
  ('Mizoram', '15'), ('Tripura', '16'), ('Meghalaya', '17'), ('Assam', '18'), ('West Bengal', '19'),
  ('Jharkhand', '20'), ('Odisha', '21'), ('Chhattisgarh', '22'), ('Madhya Pradesh', '23'), ('Gujarat', '24'),
  ('Dadra and Nagar Haveli and Daman and Diu', '26'), ('Maharashtra', '27'), ('Karnataka', '29'), ('Goa', '30'),
  ('Lakshadweep', '31'), ('Kerala', '32'), ('Tamil Nadu', '33'), ('Puducherry', '34'),
  ('Andaman and Nicobar Islands', '35'), ('Telangana', '36'), ('Andhra Pradesh', '37'), ('Ladakh', '38')
ON CONFLICT (name) DO NOTHING;

-- GST state code for a state as typed anywhere ("Gujarat", "gujarat ",
-- "Orissa", "New Delhi", "J&K"...), or NULL if it can't be recognised.
CREATE OR REPLACE FUNCTION public.gst_state_code(_state text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH k AS (
    SELECT regexp_replace(replace(lower(coalesce(_state, '')), '&', 'and'), '[^a-z]', '', 'g') AS v
  )
  SELECT coalesce(
    (SELECT s.gst_code FROM public.indian_states s, k
      WHERE regexp_replace(lower(s.name), '[^a-z]', '', 'g') = k.v),
    (SELECT CASE k.v
       WHEN 'orissa' THEN '21'
       WHEN 'pondicherry' THEN '34'
       WHEN 'newdelhi' THEN '07'
       WHEN 'nctofdelhi' THEN '07'
       WHEN 'uttaranchal' THEN '05'
       WHEN 'andamanandnicobar' THEN '35'
       WHEN 'dadraandnagarhaveli' THEN '26'
       WHEN 'damananddiu' THEN '26'
       WHEN 'jk' THEN '01'
     END FROM k)
  );
$$;
