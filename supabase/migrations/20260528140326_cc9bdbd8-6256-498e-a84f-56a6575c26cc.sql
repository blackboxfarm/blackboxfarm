-- 1. Templates table
CREATE TABLE IF NOT EXISTS public.no_lube_card_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_kind TEXT NOT NULL CHECK (profile_kind IN ('private','public')),
  language TEXT NOT NULL DEFAULT 'universal',
  aspect TEXT NOT NULL DEFAULT 'landscape_tg',
  template_name TEXT NOT NULL,
  template_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  font_family TEXT,
  font_url TEXT,
  safe_zones JSONB NOT NULL DEFAULT '{}'::jsonb,
  show_url BOOLEAN NOT NULL DEFAULT false,
  url_to_show TEXT,
  show_ca BOOLEAN NOT NULL DEFAULT true,
  exif_owner TEXT,
  exif_copyright TEXT,
  exif_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_no_lube_card_templates_lookup
  ON public.no_lube_card_templates (profile_kind, language, enabled);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.no_lube_card_templates TO authenticated;
GRANT ALL ON public.no_lube_card_templates TO service_role;

ALTER TABLE public.no_lube_card_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage card templates"
  ON public.no_lube_card_templates
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2. Render archive
CREATE TABLE IF NOT EXISTS public.no_lube_card_renders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES public.no_lube_card_templates(id) ON DELETE SET NULL,
  profile_kind TEXT NOT NULL,
  language TEXT,
  token_mint TEXT NOT NULL,
  ticker TEXT,
  multiplier NUMERIC,
  entry_mcap NUMERIC,
  current_mcap NUMERIC,
  asset_ids UUID[] NOT NULL DEFAULT '{}',
  prompt TEXT,
  output_url TEXT NOT NULL,
  ai_used BOOLEAN NOT NULL DEFAULT false,
  fallback_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_no_lube_card_renders_recent
  ON public.no_lube_card_renders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_no_lube_card_renders_mint
  ON public.no_lube_card_renders (token_mint, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.no_lube_card_renders TO authenticated;
GRANT ALL ON public.no_lube_card_renders TO service_role;

ALTER TABLE public.no_lube_card_renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read card renders"
  ON public.no_lube_card_renders
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Service role writes renders"
  ON public.no_lube_card_renders
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 3. Extend no_lube_assets with usage counters (idempotent)
ALTER TABLE public.no_lube_assets
  ADD COLUMN IF NOT EXISTS times_used INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.no_lube_assets
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- 4. Trigger to keep updated_at fresh on templates
CREATE TRIGGER trg_no_lube_card_templates_updated_at
  BEFORE UPDATE ON public.no_lube_card_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Storage bucket for uploaded template PNGs
INSERT INTO storage.buckets (id, name, public)
VALUES ('no-lube-card-templates', 'no-lube-card-templates', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Card templates are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'no-lube-card-templates');

CREATE POLICY "Authenticated admins upload card templates"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'no-lube-card-templates'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY "Authenticated admins update card templates"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'no-lube-card-templates'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY "Authenticated admins delete card templates"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'no-lube-card-templates'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  );