
-- ============================================================================
-- Creator Profile Fusion: identity-aliases + merge tombstone columns
-- ============================================================================

-- 1. Tombstone columns on developer_profiles so a merged-away profile
--    can redirect to the surviving id.
ALTER TABLE public.developer_profiles
  ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.developer_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at   timestamptz;

CREATE INDEX IF NOT EXISTS idx_developer_profiles_merged_into
  ON public.developer_profiles(merged_into)
  WHERE merged_into IS NOT NULL;

-- 2. The alias kinds enum.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creator_alias_kind') THEN
    CREATE TYPE public.creator_alias_kind AS ENUM (
      'wallet',
      'kyc_root',
      'x_user_id',
      'x_handle',
      'telegram_user_id',
      'telegram_handle',
      'discord_id',
      'discord_handle',
      'website_domain'
    );
  END IF;
END$$;

-- 3. The alias glue table — the heart of the fusion system.
CREATE TABLE IF NOT EXISTS public.creator_identity_aliases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      uuid NOT NULL REFERENCES public.developer_profiles(id) ON DELETE CASCADE,
  alias_kind      public.creator_alias_kind NOT NULL,
  alias_value     text NOT NULL,
  confidence      integer NOT NULL DEFAULT 80 CHECK (confidence BETWEEN 0 AND 100),
  source          text,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_identity_aliases_unique UNIQUE (alias_kind, alias_value)
);

CREATE INDEX IF NOT EXISTS idx_creator_aliases_creator_id
  ON public.creator_identity_aliases(creator_id);

CREATE INDEX IF NOT EXISTS idx_creator_aliases_kind_value
  ON public.creator_identity_aliases(alias_kind, alias_value);

-- 4. Merge audit log so we can always trace a fusion decision.
CREATE TABLE IF NOT EXISTS public.creator_merge_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surviving_id      uuid NOT NULL REFERENCES public.developer_profiles(id) ON DELETE CASCADE,
  absorbed_id       uuid NOT NULL,
  trigger_kind      public.creator_alias_kind NOT NULL,
  trigger_value     text NOT NULL,
  triggered_by      text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_merge_log_surviving
  ON public.creator_merge_log(surviving_id);

CREATE INDEX IF NOT EXISTS idx_creator_merge_log_absorbed
  ON public.creator_merge_log(absorbed_id);

-- 5. RLS — admin-only writes; reads allowed for authenticated users
--    (matches developer_profiles visibility pattern).
ALTER TABLE public.creator_identity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_merge_log        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_aliases_read_authenticated" ON public.creator_identity_aliases;
CREATE POLICY "creator_aliases_read_authenticated"
  ON public.creator_identity_aliases
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "creator_aliases_admin_write" ON public.creator_identity_aliases;
CREATE POLICY "creator_aliases_admin_write"
  ON public.creator_identity_aliases
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "creator_merge_log_read_authenticated" ON public.creator_merge_log;
CREATE POLICY "creator_merge_log_read_authenticated"
  ON public.creator_merge_log
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "creator_merge_log_admin_write" ON public.creator_merge_log;
CREATE POLICY "creator_merge_log_admin_write"
  ON public.creator_merge_log
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- (Service-role writes from edge functions bypass RLS automatically.)
