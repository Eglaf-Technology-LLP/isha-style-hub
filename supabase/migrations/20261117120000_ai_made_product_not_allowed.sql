-- AI declaration (client corrections, 15 Nov 2026, point 3.3.5): the 4
-- options are "No AI – real photos only" (none), "AI only for background /
-- light / crop" (ai_enhanced), "AI model photo – extra (real photos also
-- given)" (ai_model) and "AI-made product – not allowed" (fully_ai).
-- Choosing the last one blocks saving - in the product form and here, so
-- no import or other path can list one either. On 17 Nov 2026 no live
-- product had it.

CREATE OR REPLACE FUNCTION public.block_ai_made_products()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ai_content_status = 'fully_ai' THEN
    RAISE EXCEPTION 'AI-made products can''t be listed on AllBoutiqs - choose another AI option to save'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_ai_made_products_trigger ON public.products;
CREATE TRIGGER block_ai_made_products_trigger
  BEFORE INSERT OR UPDATE OF ai_content_status ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.block_ai_made_products();

COMMENT ON COLUMN public.products.ai_content_status IS
  'AI declaration: none = No AI – real photos only; ai_enhanced = AI only for background / light / crop; ai_model = AI model photo – extra (real photos also given); fully_ai = AI-made product – not allowed (refused by block_ai_made_products).';
