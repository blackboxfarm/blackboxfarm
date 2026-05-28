
-- 1. Channel settings table for active template + rotation mode
CREATE TABLE public.no_lube_channel_settings (
  profile_kind TEXT PRIMARY KEY CHECK (profile_kind IN ('public','private')),
  active_template_id UUID REFERENCES public.no_lube_card_templates(id) ON DELETE SET NULL,
  rotation_mode TEXT NOT NULL DEFAULT 'sticky' CHECK (rotation_mode IN ('sticky','random','round_robin')),
  last_used_template_id UUID REFERENCES public.no_lube_card_templates(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.no_lube_channel_settings TO authenticated;
GRANT ALL ON public.no_lube_channel_settings TO service_role;

ALTER TABLE public.no_lube_channel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings readable by authenticated" ON public.no_lube_channel_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings writable by super admins" ON public.no_lube_channel_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Seed with current defaults
INSERT INTO public.no_lube_channel_settings (profile_kind, active_template_id, rotation_mode)
SELECT t.profile_kind, t.id, 'sticky'
FROM public.no_lube_card_templates t
WHERE t.is_default = true
ON CONFLICT (profile_kind) DO NOTHING;

-- 2. Backfill show_url safe zone on existing templates
UPDATE public.no_lube_card_templates
SET safe_zones = COALESCE(safe_zones,'{}'::jsonb) ||
  jsonb_build_object('show_url', jsonb_build_object('x',30,'y',600,'w',964,'h',28))
WHERE NOT (safe_zones ? 'show_url');

-- 3. Selection reason on render archive
ALTER TABLE public.no_lube_card_renders
  ADD COLUMN IF NOT EXISTS selection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rotation_mode TEXT;

-- 4. Parse failure log for insiders-lifecycle-builder hard rejects
CREATE TABLE public.insiders_parse_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id BIGINT,
  raw_text TEXT,
  reason TEXT NOT NULL,
  parsed_fields JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.insiders_parse_failures TO authenticated;
GRANT ALL ON public.insiders_parse_failures TO service_role;

ALTER TABLE public.insiders_parse_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parse failures readable by super admins" ON public.insiders_parse_failures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
