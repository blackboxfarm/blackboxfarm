
ALTER TABLE public.x_communities
  ADD COLUMN IF NOT EXISTS recycled_score integer,
  ADD COLUMN IF NOT EXISTS recycled_band text,
  ADD COLUMN IF NOT EXISTS recycled_signals jsonb,
  ADD COLUMN IF NOT EXISTS recycled_evaluated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_x_communities_recycled_band
  ON public.x_communities (recycled_band)
  WHERE recycled_band IS NOT NULL;

CREATE OR REPLACE VIEW public.v_community_token_outcomes AS
SELECT
  c.community_id,
  COUNT(dt.token_mint) AS linked_token_count,
  COUNT(*) FILTER (WHERE dt.outcome IN ('rugged','failed') OR (COALESCE(dt.peak_market_cap_usd,0) < 5000 AND dt.is_active = false)) AS dead_count,
  COUNT(*) FILTER (WHERE dt.outcome = 'graduated' OR COALESCE(dt.peak_market_cap_usd,0) >= 69000) AS success_count,
  CASE WHEN COUNT(dt.token_mint) > 0
       THEN ROUND(100.0 * COUNT(*) FILTER (WHERE dt.outcome IN ('rugged','failed') OR (COALESCE(dt.peak_market_cap_usd,0) < 5000 AND dt.is_active = false)) / COUNT(dt.token_mint))
       ELSE 0 END AS dead_rate_pct
FROM public.x_communities c
LEFT JOIN LATERAL unnest(COALESCE(c.linked_token_mints, ARRAY[]::text[])) AS lm(mint) ON true
LEFT JOIN public.developer_tokens dt ON dt.token_mint = lm.mint
GROUP BY c.community_id;

CREATE OR REPLACE VIEW public.v_community_admin_dev_link AS
SELECT
  c.community_id,
  ah.handle AS admin_handle,
  dp.master_wallet_address AS admin_wallet,
  dp.id AS developer_id,
  COALESCE(dp.total_tokens_created, 0) AS prior_tokens,
  COALESCE(dp.failed_tokens, 0) AS prior_failures
FROM public.x_communities c
LEFT JOIN LATERAL unnest(COALESCE(c.admin_usernames, ARRAY[]::text[])) AS ah(handle) ON true
LEFT JOIN public.developer_profiles dp
  ON LOWER(dp.twitter_handle) = LOWER(ah.handle);
