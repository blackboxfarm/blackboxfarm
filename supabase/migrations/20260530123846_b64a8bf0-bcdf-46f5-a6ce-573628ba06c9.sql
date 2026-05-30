
-- Reusable per-persona daily multiplier leaderboard
CREATE TABLE public.leaderboard_profiles (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  day_start_hour smallint NOT NULL DEFAULT 6 CHECK (day_start_hour BETWEEN 0 AND 23),
  timezone text NOT NULL DEFAULT 'America/Toronto',
  post_hour smallint NOT NULL DEFAULT 4 CHECK (post_hour BETWEEN 0 AND 23),
  bg_public_url text,
  bg_private_url text,
  bg_public_prompt text,
  bg_private_prompt text,
  accent_hex text NOT NULL DEFAULT '#22d3ee',
  brand_tagline text,
  channel_name_filter text,
  post_to_tg_public boolean NOT NULL DEFAULT true,
  post_to_tg_private boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.leaderboard_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaderboard_profiles TO authenticated;
GRANT ALL ON public.leaderboard_profiles TO service_role;

ALTER TABLE public.leaderboard_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaderboard_profiles_read_all" ON public.leaderboard_profiles FOR SELECT USING (true);
CREATE POLICY "leaderboard_profiles_admin_write" ON public.leaderboard_profiles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE public.leaderboard_daily_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text NOT NULL REFERENCES public.leaderboard_profiles(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  window_start_utc timestamptz NOT NULL,
  window_end_utc timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|rendered|posted|failed
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  entry_count int NOT NULL DEFAULT 0,
  image_public_url text,
  image_private_url text,
  tg_public_message_id bigint,
  tg_private_message_id bigint,
  error text,
  rendered_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, local_date)
);

CREATE INDEX idx_leaderboard_daily_runs_profile_date ON public.leaderboard_daily_runs (profile_id, local_date DESC);

GRANT SELECT ON public.leaderboard_daily_runs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaderboard_daily_runs TO authenticated;
GRANT ALL ON public.leaderboard_daily_runs TO service_role;

ALTER TABLE public.leaderboard_daily_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaderboard_runs_read_all" ON public.leaderboard_daily_runs FOR SELECT USING (true);
CREATE POLICY "leaderboard_runs_admin_write" ON public.leaderboard_daily_runs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_leaderboard_profiles_updated_at
  BEFORE UPDATE ON public.leaderboard_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_leaderboard_daily_runs_updated_at
  BEFORE UPDATE ON public.leaderboard_daily_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
