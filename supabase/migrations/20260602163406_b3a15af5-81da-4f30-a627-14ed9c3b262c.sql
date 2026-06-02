
ALTER TABLE public.profile_subscription_configs
  ADD COLUMN IF NOT EXISTS public_chat_id text,
  ADD COLUMN IF NOT EXISTS public_welcome_copy text,
  ADD COLUMN IF NOT EXISTS public_welcome_image_url text,
  ADD COLUMN IF NOT EXISTS public_welcome_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_welcome_persona text NOT NULL DEFAULT 'luna_dusk';

CREATE TABLE IF NOT EXISTS public.nolube_seed_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL,
  channel_kind text NOT NULL CHECK (channel_kind IN ('public','private')),
  chat_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  detected_via text NOT NULL CHECK (detected_via IN ('spike','manual','baseline')),
  expected_count integer,
  actual_count integer NOT NULL DEFAULT 0,
  trigger_window_joins integer,
  trigger_rolling_median numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nolube_seed_batches_chat ON public.nolube_seed_batches(chat_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nolube_seed_batches TO authenticated;
GRANT ALL ON public.nolube_seed_batches TO service_role;
ALTER TABLE public.nolube_seed_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin seed batches" ON public.nolube_seed_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.nolube_channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL,
  channel_kind text NOT NULL CHECK (channel_kind IN ('public','private')),
  chat_id text NOT NULL,
  telegram_user_id bigint NOT NULL,
  username text,
  first_name text,
  last_name text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  is_seed boolean NOT NULL DEFAULT false,
  seed_batch_id uuid REFERENCES public.nolube_seed_batches(id) ON DELETE SET NULL,
  classification_locked boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'roster' CHECK (source IN ('roster','chat_member_event','manual')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  welcomed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, telegram_user_id)
);
CREATE INDEX IF NOT EXISTS idx_nolube_members_chat_joined ON public.nolube_channel_members(chat_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_nolube_members_chat_left ON public.nolube_channel_members(chat_id, left_at DESC) WHERE left_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nolube_members_seed ON public.nolube_channel_members(chat_id, is_seed);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nolube_channel_members TO authenticated;
GRANT ALL ON public.nolube_channel_members TO service_role;
ALTER TABLE public.nolube_channel_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin nolube members" ON public.nolube_channel_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.nolube_channel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL,
  channel_kind text NOT NULL,
  chat_id text NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  total_members integer NOT NULL DEFAULT 0,
  seed_active integer NOT NULL DEFAULT 0,
  organic_active integer NOT NULL DEFAULT 0,
  organic_joins_window integer NOT NULL DEFAULT 0,
  organic_leaves_window integer NOT NULL DEFAULT 0,
  seed_leaves_window integer NOT NULL DEFAULT 0,
  seed_active_batch_id uuid REFERENCES public.nolube_seed_batches(id) ON DELETE SET NULL,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_nolube_snapshots_chat_ts ON public.nolube_channel_snapshots(chat_id, ts DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nolube_channel_snapshots TO authenticated;
GRANT ALL ON public.nolube_channel_snapshots TO service_role;
ALTER TABLE public.nolube_channel_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin nolube snapshots" ON public.nolube_channel_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE VIEW public.nolube_member_retention AS
SELECT
  m.profile_key,
  m.chat_id,
  m.channel_kind,
  m.is_seed,
  date_trunc('week', m.joined_at) AS cohort_week,
  COUNT(*) AS cohort_size,
  COUNT(*) FILTER (WHERE m.left_at IS NULL) AS still_active,
  COUNT(*) FILTER (WHERE m.left_at IS NULL OR m.left_at >  m.joined_at + INTERVAL '1 day')   AS surviving_d1,
  COUNT(*) FILTER (WHERE m.left_at IS NULL OR m.left_at >  m.joined_at + INTERVAL '3 days')  AS surviving_d3,
  COUNT(*) FILTER (WHERE m.left_at IS NULL OR m.left_at >  m.joined_at + INTERVAL '7 days')  AS surviving_d7,
  COUNT(*) FILTER (WHERE m.left_at IS NULL OR m.left_at >  m.joined_at + INTERVAL '14 days') AS surviving_d14,
  COUNT(*) FILTER (WHERE m.left_at IS NULL OR m.left_at >  m.joined_at + INTERVAL '30 days') AS surviving_d30,
  COUNT(*) FILTER (WHERE m.left_at IS NULL OR m.left_at >  m.joined_at + INTERVAL '60 days') AS surviving_d60,
  COUNT(*) FILTER (WHERE m.left_at IS NULL OR m.left_at >  m.joined_at + INTERVAL '90 days') AS surviving_d90
FROM public.nolube_channel_members m
GROUP BY 1,2,3,4,5;
GRANT SELECT ON public.nolube_member_retention TO authenticated;
GRANT SELECT ON public.nolube_member_retention TO service_role;
