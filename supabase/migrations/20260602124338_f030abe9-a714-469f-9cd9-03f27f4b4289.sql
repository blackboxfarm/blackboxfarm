
ALTER TABLE public.leaderboard_weekly_runs
  ADD COLUMN IF NOT EXISTS rendered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error TEXT;

ALTER TABLE public.leaderboard_monthly_runs
  ADD COLUMN IF NOT EXISTS rendered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error TEXT;
