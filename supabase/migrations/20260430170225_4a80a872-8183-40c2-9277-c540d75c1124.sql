-- Replace v_live_death_watch with a token_price_history-based source.
DROP VIEW IF EXISTS public.v_live_death_watch;

CREATE VIEW public.v_live_death_watch
WITH (security_invoker = on) AS
WITH ath AS (
  SELECT DISTINCT ON (token_mint)
    token_mint,
    market_cap_usd AS ath_mcap_usd,
    captured_at    AS ath_at
  FROM public.token_price_history
  WHERE market_cap_usd IS NOT NULL
  ORDER BY token_mint, market_cap_usd DESC, captured_at DESC
),
latest AS (
  SELECT DISTINCT ON (token_mint)
    token_mint,
    market_cap_usd AS latest_mcap_usd,
    price_usd      AS latest_price_usd,
    captured_at    AS latest_at
  FROM public.token_price_history
  WHERE market_cap_usd IS NOT NULL
  ORDER BY token_mint, captured_at DESC
),
latest_snap AS (
  SELECT DISTINCT ON (token_mint)
    token_mint,
    health_grade,
    health_score,
    risk_label,
    total_holders,
    dust_percentage,
    snapshot_hour
  FROM public.token_health_snapshots
  ORDER BY token_mint, snapshot_hour DESC
)
SELECT
  ath.token_mint,
  COALESCE(tl.symbol, pw.token_symbol)          AS symbol,
  tl.name,
  tl.launchpad,
  tl.creator_wallet,
  ath.ath_mcap_usd                              AS ath_usd,
  ath.ath_at,
  latest.latest_mcap_usd                        AS current_mcap_usd,
  latest.latest_price_usd                       AS current_price_usd,
  latest.latest_at,
  COALESCE(tl.liquidity_usd, pw.liquidity_usd)  AS liquidity_usd,
  COALESCE(ls.total_holders, pw.holder_count)   AS holder_count,
  ls.health_grade,
  ls.health_score,
  ls.risk_label,
  ls.dust_percentage,
  tl.first_seen_at,
  tl.last_seen_at,
  tl.current_status,
  tl.death_cause,
  tl.death_confidence,
  tl.autopsy_at                                 AS death_at,
  GREATEST(0::numeric, LEAST(1::numeric,
    1 - (latest.latest_mcap_usd / NULLIF(ath.ath_mcap_usd, 0))
  ))                                            AS collapse_pct,
  ath.ath_mcap_usd * GREATEST(0::numeric, LEAST(1::numeric,
    1 - (latest.latest_mcap_usd / NULLIF(ath.ath_mcap_usd, 0))
  ))                                            AS dollar_wipeout
FROM ath
JOIN latest USING (token_mint)
LEFT JOIN public.token_lifecycle      tl ON tl.token_mint = ath.token_mint
LEFT JOIN public.pumpfun_watchlist    pw ON pw.token_mint = ath.token_mint
LEFT JOIN latest_snap                 ls ON ls.token_mint = ath.token_mint
WHERE ath.ath_mcap_usd >= 50000
  AND (
        latest.latest_mcap_usd < 1000
        OR latest.latest_mcap_usd < ath.ath_mcap_usd * 0.05
      );

COMMENT ON VIEW public.v_live_death_watch IS
  'Collapse candidates derived from token_price_history: ATH market cap >= $50k AND (latest mcap < $1k OR down >= 95% from ATH). Joins lifecycle, watchlist, and latest health snapshot for display. security_invoker=on.';