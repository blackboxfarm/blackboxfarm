ALTER TABLE public.holders_intel_seen_tokens
  ADD COLUMN IF NOT EXISTS entry_mcap_usd numeric;

ALTER TABLE public.no_lube_post_log
  ADD COLUMN IF NOT EXISTS post_kind text NOT NULL DEFAULT 'big_picture';

UPDATE public.holders_intel_seen_tokens
SET entry_mcap_usd = market_cap_at_discovery
WHERE entry_mcap_usd IS NULL AND market_cap_at_discovery IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_no_lube_post_log_kind ON public.no_lube_post_log(post_kind);