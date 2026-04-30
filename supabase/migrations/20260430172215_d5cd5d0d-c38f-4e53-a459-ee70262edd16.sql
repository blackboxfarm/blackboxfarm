-- Update v_live_death_watch: add token_metadata symbol/name fallback,
-- and an is_recent flag so Live Death Watch and Cool Deaths Backlog
-- never overlap.

DROP VIEW IF EXISTS public.v_live_death_watch;

CREATE VIEW public.v_live_death_watch
WITH (security_invoker=on) AS
WITH ath AS (
  SELECT DISTINCT ON (token_price_history.token_mint) token_price_history.token_mint,
         token_price_history.market_cap_usd AS ath_mcap_usd,
         token_price_history.captured_at     AS ath_at
  FROM token_price_history
  WHERE token_price_history.market_cap_usd IS NOT NULL
  ORDER BY token_price_history.token_mint, token_price_history.market_cap_usd DESC, token_price_history.captured_at DESC
), latest AS (
  SELECT DISTINCT ON (token_price_history.token_mint) token_price_history.token_mint,
         token_price_history.market_cap_usd AS latest_mcap_usd,
         token_price_history.price_usd      AS latest_price_usd,
         token_price_history.captured_at    AS latest_at
  FROM token_price_history
  WHERE token_price_history.market_cap_usd IS NOT NULL
  ORDER BY token_price_history.token_mint, token_price_history.captured_at DESC
), latest_snap AS (
  SELECT DISTINCT ON (token_health_snapshots.token_mint) token_health_snapshots.token_mint,
         token_health_snapshots.health_grade,
         token_health_snapshots.health_score,
         token_health_snapshots.risk_label,
         token_health_snapshots.total_holders,
         token_health_snapshots.dust_percentage,
         token_health_snapshots.snapshot_hour
  FROM token_health_snapshots
  ORDER BY token_health_snapshots.token_mint, token_health_snapshots.snapshot_hour DESC
)
SELECT
  ath.token_mint,
  COALESCE(NULLIF(tl.symbol,''), NULLIF(pw.token_symbol,''), NULLIF(tm.symbol,'')) AS symbol,
  COALESCE(NULLIF(tl.name,''),   NULLIF(tm.name,''))                                AS name,
  tl.launchpad,
  tl.creator_wallet,
  ath.ath_mcap_usd                AS ath_usd,
  ath.ath_at,
  latest.latest_mcap_usd          AS current_mcap_usd,
  latest.latest_price_usd         AS current_price_usd,
  latest.latest_at,
  COALESCE(tl.liquidity_usd, pw.liquidity_usd)        AS liquidity_usd,
  COALESCE(ls.total_holders, pw.holder_count)         AS holder_count,
  ls.health_grade,
  ls.health_score,
  ls.risk_label,
  ls.dust_percentage,
  tl.first_seen_at,
  tl.last_seen_at,
  tl.current_status,
  tl.death_cause,
  tl.death_confidence,
  tl.autopsy_at                   AS death_at,
  GREATEST(0::numeric, LEAST(1::numeric, 1::numeric - latest.latest_mcap_usd / NULLIF(ath.ath_mcap_usd, 0::numeric))) AS collapse_pct,
  ath.ath_mcap_usd * GREATEST(0::numeric, LEAST(1::numeric, 1::numeric - latest.latest_mcap_usd / NULLIF(ath.ath_mcap_usd, 0::numeric))) AS dollar_wipeout,
  (latest.latest_at >= now() - interval '24 hours') AS is_recent
FROM ath
JOIN latest USING (token_mint)
LEFT JOIN token_lifecycle    tl ON tl.token_mint    = ath.token_mint
LEFT JOIN pumpfun_watchlist  pw ON pw.token_mint    = ath.token_mint
LEFT JOIN token_metadata     tm ON tm.mint_address  = ath.token_mint
LEFT JOIN latest_snap        ls ON ls.token_mint    = ath.token_mint
WHERE ath.ath_mcap_usd >= 50000::numeric
  AND (latest.latest_mcap_usd < 1000::numeric OR latest.latest_mcap_usd < (ath.ath_mcap_usd * 0.05));
