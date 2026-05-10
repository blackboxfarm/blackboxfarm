CREATE OR REPLACE VIEW public.v_community_token_outcomes AS
WITH linked AS (
  SELECT
    c.community_id,
    lm.mint AS token_mint
  FROM public.x_communities c
  LEFT JOIN LATERAL unnest(COALESCE(c.linked_token_mints, ARRAY[]::text[])) AS lm(mint) ON true
), outcomes AS (
  SELECT
    l.community_id,
    l.token_mint,
    dt.outcome AS developer_outcome,
    dt.peak_market_cap_usd AS developer_peak_mcap,
    dt.current_market_cap_usd AS developer_current_mcap,
    dt.is_active AS developer_is_active,
    pw.status AS watchlist_status,
    pw.market_cap_usd AS watchlist_mcap,
    pw.is_graduated AS watchlist_is_graduated,
    pw.liquidity_usd AS watchlist_liquidity,
    tl.current_status AS lifecycle_status,
    tl.death_cause AS lifecycle_death_cause,
    tl.market_cap AS lifecycle_mcap,
    tl.liquidity_usd AS lifecycle_liquidity
  FROM linked l
  LEFT JOIN public.developer_tokens dt ON dt.token_mint = l.token_mint
  LEFT JOIN public.pumpfun_watchlist pw ON pw.token_mint = l.token_mint
  LEFT JOIN public.token_lifecycle tl ON tl.token_mint = l.token_mint
  WHERE l.token_mint IS NOT NULL
)
SELECT
  community_id,
  COUNT(token_mint) AS linked_token_count,
  COUNT(*) FILTER (
    WHERE developer_outcome IN ('rugged','failed')
       OR (COALESCE(developer_peak_mcap, developer_current_mcap, 0) < 5000 AND developer_is_active = false)
       OR watchlist_status IN ('dead','rugged','rejected','permanent_reject','pruned')
       OR (COALESCE(watchlist_mcap, 0) < 5000 AND COALESCE(watchlist_is_graduated, false) = false)
       OR lifecycle_death_cause IS NOT NULL
       OR lifecycle_status IN ('dead','rugged','failed')
       OR (COALESCE(lifecycle_mcap, 0) < 5000 AND COALESCE(lifecycle_liquidity, 0) < 1000 AND lifecycle_status <> 'active')
  ) AS dead_count,
  COUNT(*) FILTER (
    WHERE developer_outcome = 'graduated'
       OR COALESCE(developer_peak_mcap, 0) >= 69000
       OR COALESCE(watchlist_is_graduated, false) = true
       OR COALESCE(watchlist_mcap, 0) >= 69000
  ) AS success_count,
  CASE WHEN COUNT(token_mint) > 0
       THEN ROUND(100.0 * COUNT(*) FILTER (
         WHERE developer_outcome IN ('rugged','failed')
            OR (COALESCE(developer_peak_mcap, developer_current_mcap, 0) < 5000 AND developer_is_active = false)
            OR watchlist_status IN ('dead','rugged','rejected','permanent_reject','pruned')
            OR (COALESCE(watchlist_mcap, 0) < 5000 AND COALESCE(watchlist_is_graduated, false) = false)
            OR lifecycle_death_cause IS NOT NULL
            OR lifecycle_status IN ('dead','rugged','failed')
            OR (COALESCE(lifecycle_mcap, 0) < 5000 AND COALESCE(lifecycle_liquidity, 0) < 1000 AND lifecycle_status <> 'active')
       ) / COUNT(token_mint))
       ELSE 0 END AS dead_rate_pct
FROM outcomes
GROUP BY community_id;