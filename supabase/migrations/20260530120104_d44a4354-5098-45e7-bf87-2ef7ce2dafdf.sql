
ALTER TABLE public.telegram_insider_token_lifecycle
  ADD COLUMN IF NOT EXISTS last_legacy_swept_at TIMESTAMPTZ;

ALTER TABLE public.no_lube_global_profile
  ADD COLUMN IF NOT EXISTS progress_step NUMERIC NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS legacy_min_mcap NUMERIC NOT NULL DEFAULT 250000,
  ADD COLUMN IF NOT EXISTS legacy_min_gap_hours INT NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS legacy_max_age_days INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS legacy_progress_step NUMERIC NOT NULL DEFAULT 1.5;
