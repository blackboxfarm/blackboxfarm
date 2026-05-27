
-- 1. Asset library table
CREATE TABLE IF NOT EXISTS public.no_lube_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('background','character','frame','sticker','logo')),
  name TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  language TEXT,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_no_lube_assets_cat_enabled ON public.no_lube_assets (category, enabled);
CREATE INDEX IF NOT EXISTS idx_no_lube_assets_language ON public.no_lube_assets (language);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.no_lube_assets TO authenticated;
GRANT ALL ON public.no_lube_assets TO service_role;
ALTER TABLE public.no_lube_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage no_lube_assets"
  ON public.no_lube_assets
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2. Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('no-lube-assets', 'no-lube-assets', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('no-lube-rendered-cards', 'no-lube-rendered-cards', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: super admins upload/delete, anyone reads (buckets are public)
CREATE POLICY "Super admins upload no_lube_assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'no-lube-assets'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admins update no_lube_assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'no-lube-assets'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admins delete no_lube_assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'no-lube-assets'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 3. Post log additions
ALTER TABLE public.no_lube_post_log
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_prompt TEXT;

-- 4. Channel profile additions for per-profile trade bot
ALTER TABLE public.no_lube_channel_profiles
  ADD COLUMN IF NOT EXISTS trade_bot_username TEXT,
  ADD COLUMN IF NOT EXISTS trade_bot_token_secret_name TEXT,
  ADD COLUMN IF NOT EXISTS access_purchase_url TEXT,
  ADD COLUMN IF NOT EXISTS cta_button_text TEXT;
