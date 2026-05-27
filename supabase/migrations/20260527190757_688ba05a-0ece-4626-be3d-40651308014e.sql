ALTER TABLE public.no_lube_post_log
  ADD COLUMN IF NOT EXISTS times_posted INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_mcap_at_post NUMERIC,
  ADD COLUMN IF NOT EXISTS last_multiplier NUMERIC,
  ADD COLUMN IF NOT EXISTS last_posted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_no_lube_post_log_token_mint_composed
  ON public.no_lube_post_log (token_mint, posted, composed_at DESC);

ALTER TABLE public.no_lube_global_profile
  ADD COLUMN IF NOT EXISTS multiplier_threshold NUMERIC NOT NULL DEFAULT 2.0;