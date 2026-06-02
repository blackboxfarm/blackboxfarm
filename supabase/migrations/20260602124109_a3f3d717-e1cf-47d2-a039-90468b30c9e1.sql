
ALTER TABLE public.leaderboard_daily_runs
  ADD COLUMN IF NOT EXISTS size_chosen TEXT,
  ADD COLUMN IF NOT EXISTS qualifying_4x_count INT,
  ADD COLUMN IF NOT EXISTS pinned_message_id_public BIGINT,
  ADD COLUMN IF NOT EXISTS pinned_message_id_private BIGINT,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS caption_text TEXT;

ALTER TABLE public.leaderboard_profiles
  ADD COLUMN IF NOT EXISTS auto_pin_daily BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_pin_weekly BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_pin_monthly BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_unpin_previous BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.leaderboard_weekly_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id TEXT NOT NULL REFERENCES public.leaderboard_profiles(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  window_start_utc TIMESTAMPTZ NOT NULL,
  window_end_utc TIMESTAMPTZ NOT NULL,
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  image_public_url TEXT,
  image_private_url TEXT,
  tg_public_message_id BIGINT,
  tg_private_message_id BIGINT,
  posted_at TIMESTAMPTZ,
  pinned_message_id_public BIGINT,
  pinned_message_id_private BIGINT,
  pinned_at TIMESTAMPTZ,
  caption_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, week_start_date)
);
GRANT SELECT ON public.leaderboard_weekly_runs TO authenticated;
GRANT ALL  ON public.leaderboard_weekly_runs TO service_role;
ALTER TABLE public.leaderboard_weekly_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weekly_runs_admin_select" ON public.leaderboard_weekly_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.leaderboard_monthly_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id TEXT NOT NULL REFERENCES public.leaderboard_profiles(id) ON DELETE CASCADE,
  month_start_date DATE NOT NULL,
  month_label TEXT NOT NULL,
  window_start_utc TIMESTAMPTZ NOT NULL,
  window_end_utc TIMESTAMPTZ NOT NULL,
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  image_public_url TEXT,
  image_private_url TEXT,
  tg_public_message_id BIGINT,
  tg_private_message_id BIGINT,
  posted_at TIMESTAMPTZ,
  pinned_message_id_public BIGINT,
  pinned_message_id_private BIGINT,
  pinned_at TIMESTAMPTZ,
  caption_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, month_start_date)
);
GRANT SELECT ON public.leaderboard_monthly_runs TO authenticated;
GRANT ALL  ON public.leaderboard_monthly_runs TO service_role;
ALTER TABLE public.leaderboard_monthly_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_runs_admin_select" ON public.leaderboard_monthly_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
