-- Internal performance/quality grade per boutique (A++ ... C), assigned
-- during registration review and changed later. Kept in its own admin-only
-- table rather than on vendors, because vendors rows are publicly readable
-- for approved stores and a column there would expose the grade via the API.
CREATE TABLE public.vendor_quality_tags (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  tag text NOT NULL CHECK (tag IN ('A++', 'A+', 'A', 'B+', 'B', 'C')),
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_quality_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage vendor quality tags"
  ON public.vendor_quality_tags FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_vendor_quality_tags_updated_at
  BEFORE UPDATE ON public.vendor_quality_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
