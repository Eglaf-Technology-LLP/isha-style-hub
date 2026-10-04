-- AI content declaration chosen during product listing. NULL means the
-- listing predates the declaration (legacy) - the listing forms require a
-- choice on every new save, so NULL only survives on untouched old rows.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ai_content_status text
    CHECK (ai_content_status IN ('none', 'ai_enhanced', 'ai_model', 'fully_ai'));
