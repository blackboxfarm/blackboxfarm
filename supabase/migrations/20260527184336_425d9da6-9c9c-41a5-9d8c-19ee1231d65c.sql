
-- 1. Allow 'default' kind on channel profiles + add tab nickname & TG link
ALTER TABLE public.no_lube_channel_profiles
  DROP CONSTRAINT IF EXISTS no_lube_channel_profiles_kind_check;
ALTER TABLE public.no_lube_channel_profiles
  ADD CONSTRAINT no_lube_channel_profiles_kind_check
  CHECK (kind IN ('default','public','private'));

ALTER TABLE public.no_lube_channel_profiles
  ADD COLUMN IF NOT EXISTS tab_nickname text,
  ADD COLUMN IF NOT EXISTS telegram_link text;

INSERT INTO public.no_lube_channel_profiles (kind, language, tab_nickname)
VALUES ('default','en','Default')
ON CONFLICT (kind) DO NOTHING;

UPDATE public.no_lube_channel_profiles
SET tab_nickname = CASE kind
  WHEN 'default' THEN 'Default'
  WHEN 'public'  THEN 'Public Channel'
  WHEN 'private' THEN 'Private Channel'
END
WHERE tab_nickname IS NULL;

-- 2. Singleton global profile (shared language + style across all 3 tabs)
CREATE TABLE IF NOT EXISTS public.no_lube_global_profile (
  id text PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  language text NOT NULL DEFAULT 'en',
  style    text NOT NULL DEFAULT 'degen',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.no_lube_global_profile TO authenticated;
GRANT ALL ON public.no_lube_global_profile TO service_role;

ALTER TABLE public.no_lube_global_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins read no_lube global profile"
  ON public.no_lube_global_profile FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE POLICY "super admins insert no_lube global profile"
  ON public.no_lube_global_profile FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "super admins update no_lube global profile"
  ON public.no_lube_global_profile FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE POLICY "super admins delete no_lube global profile"
  ON public.no_lube_global_profile FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

INSERT INTO public.no_lube_global_profile (id, language, style)
VALUES ('singleton','en','degen')
ON CONFLICT (id) DO NOTHING;

-- 3. Socials list (ordered, with optional AES-GCM encrypted password)
CREATE TABLE IF NOT EXISTS public.no_lube_socials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  handle text NOT NULL DEFAULT '',
  display_order int NOT NULL DEFAULT 0,
  password_ciphertext text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS no_lube_socials_order_idx
  ON public.no_lube_socials (display_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.no_lube_socials TO authenticated;
GRANT ALL ON public.no_lube_socials TO service_role;

ALTER TABLE public.no_lube_socials ENABLE ROW LEVEL SECURITY;

-- Admins see/manage everything EXCEPT the ciphertext (column-level guard via view would be nicer,
-- but simplest: ciphertext only ever set via service-role edge function; the UI just renders has_password).
CREATE POLICY "super admins read no_lube socials"
  ON public.no_lube_socials FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE POLICY "super admins insert no_lube socials"
  ON public.no_lube_socials FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "super admins update no_lube socials"
  ON public.no_lube_socials FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE POLICY "super admins delete no_lube socials"
  ON public.no_lube_socials FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));
