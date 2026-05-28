ALTER TABLE public.no_lube_post_log
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS had_image boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_no_lube_post_log_mint_channel
  ON public.no_lube_post_log (token_mint, channel, posted_at DESC);