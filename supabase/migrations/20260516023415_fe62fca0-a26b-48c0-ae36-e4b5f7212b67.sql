ALTER TABLE public.holders_intel_post_queue
  ADD COLUMN IF NOT EXISTS tweet_composed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_snippet text,
  ADD COLUMN IF NOT EXISTS health_grade text,
  ADD COLUMN IF NOT EXISTS health_score integer,
  ADD COLUMN IF NOT EXISTS health_label text,
  ADD COLUMN IF NOT EXISTS real_holders integer,
  ADD COLUMN IF NOT EXISTS total_wallets integer,
  ADD COLUMN IF NOT EXISTS whales_count integer,
  ADD COLUMN IF NOT EXISTS serious_count integer,
  ADD COLUMN IF NOT EXISTS retail_count integer,
  ADD COLUMN IF NOT EXISTS dust_count integer,
  ADD COLUMN IF NOT EXISTS dust_pct integer,
  ADD COLUMN IF NOT EXISTS snapshot_label text,
  ADD COLUMN IF NOT EXISTS hashtags_line text,
  ADD COLUMN IF NOT EXISTS banner_used_url text,
  ADD COLUMN IF NOT EXISTS posted_handle text DEFAULT 'HoldersIntel';

CREATE INDEX IF NOT EXISTS idx_hipq_manual_status_created
  ON public.holders_intel_post_queue (manual_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hipq_archive_posted
  ON public.holders_intel_post_queue (manual_posted_at DESC NULLS LAST)
  WHERE manual_status = 'posted_manual';

CREATE INDEX IF NOT EXISTS idx_hipq_search_mint
  ON public.holders_intel_post_queue (token_mint);
