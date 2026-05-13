-- 1) Build a materialized snapshot of the Live Death Watch so the admin
--    list never has to recompute the heavy DISTINCT ON / joins on read.
DROP MATERIALIZED VIEW IF EXISTS public.mv_live_death_watch;

CREATE MATERIALIZED VIEW public.mv_live_death_watch AS
WITH ath AS (
  SELECT DISTINCT ON (tph.token_mint)
         tph.token_mint,
         tph.market_cap_usd AS ath_mcap_usd,
         tph.captured_at     AS ath_at
  FROM public.token_price_history tph
  WHERE tph.market_cap_usd IS NOT NULL
  ORDER BY tph.token_mint, tph.market_cap_usd DESC, tph.captured_at DESC
), latest AS (
  SELECT DISTINCT ON (tph.token_mint)
         tph.token_mint,
         tph.market_cap_usd AS latest_mcap_usd,
         tph.price_usd      AS latest_price_usd,
         tph.captured_at    AS latest_at
  FROM public.token_price_history tph
  WHERE tph.market_cap_usd IS NOT NULL
  ORDER BY tph.token_mint, tph.captured_at DESC
), latest_snap AS (
  SELECT DISTINCT ON (ths.token_mint)
         ths.token_mint,
         ths.health_grade,
         ths.health_score,
         ths.risk_label,
         ths.total_holders,
         ths.dust_percentage,
         ths.snapshot_hour
  FROM public.token_health_snapshots ths
  ORDER BY ths.token_mint, ths.snapshot_hour DESC
), enriched AS (
  SELECT
    ath.token_mint,
    COALESCE(
      CASE WHEN tl.symbol IS NOT NULL AND btrim(tl.symbol) <> '' AND lower(btrim(tl.symbol)) NOT IN ('unknown', 'unk', 'token') THEN btrim(tl.symbol) END,
      CASE WHEN pw.token_symbol IS NOT NULL AND btrim(pw.token_symbol) <> '' AND lower(btrim(pw.token_symbol)) NOT IN ('unknown', 'unk', 'token') THEN btrim(pw.token_symbol) END,
      CASE WHEN tm.symbol IS NOT NULL AND btrim(tm.symbol) <> '' AND lower(btrim(tm.symbol)) NOT IN ('unknown', 'unk', 'token') THEN btrim(tm.symbol) END
    ) AS symbol,
    COALESCE(
      CASE WHEN tl.name IS NOT NULL AND btrim(tl.name) <> '' AND lower(btrim(tl.name)) NOT IN ('unknown', 'unknown token', 'token') THEN btrim(tl.name) END,
      CASE WHEN pw.token_name IS NOT NULL AND btrim(pw.token_name) <> '' AND lower(btrim(pw.token_name)) NOT IN ('unknown', 'unknown token', 'token') THEN btrim(pw.token_name) END,
      CASE WHEN tm.name IS NOT NULL AND btrim(tm.name) <> '' AND lower(btrim(tm.name)) NOT IN ('unknown', 'unknown token', 'token') THEN btrim(tm.name) END
    ) AS name,
    tl.launchpad,
    tl.creator_wallet,
    ath.ath_mcap_usd AS ath_usd,
    ath.ath_at,
    latest.latest_mcap_usd AS current_mcap_usd,
    latest.latest_price_usd AS current_price_usd,
    latest.latest_at,
    COALESCE(tl.liquidity_usd, pw.liquidity_usd) AS liquidity_usd,
    COALESCE(tl.volume_24h, pw.volume_5m, pw.volume_sol) AS volume_24h,
    COALESCE(ls.total_holders, pw.holder_count) AS holder_count,
    ls.health_grade,
    ls.health_score,
    ls.risk_label,
    ls.dust_percentage,
    tl.first_seen_at,
    tl.last_seen_at,
    tl.current_status,
    GREATEST(0::numeric, LEAST(1::numeric, 1::numeric - latest.latest_mcap_usd / NULLIF(ath.ath_mcap_usd, 0::numeric))) AS collapse_pct,
    ath.ath_mcap_usd * GREATEST(0::numeric, LEAST(1::numeric, 1::numeric - latest.latest_mcap_usd / NULLIF(ath.ath_mcap_usd, 0::numeric))) AS dollar_wipeout,
    tl.death_cause AS raw_death_cause,
    tl.death_confidence AS raw_death_confidence,
    tl.autopsy_at AS raw_death_at
  FROM ath
  JOIN latest USING (token_mint)
  LEFT JOIN public.token_lifecycle tl ON tl.token_mint = ath.token_mint
  LEFT JOIN public.pumpfun_watchlist pw ON pw.token_mint = ath.token_mint
  LEFT JOIN public.token_metadata tm ON tm.mint_address = ath.token_mint
  LEFT JOIN latest_snap ls ON ls.token_mint = ath.token_mint
  WHERE ath.ath_mcap_usd >= 50000::numeric
    AND (latest.latest_mcap_usd < 1000::numeric OR latest.latest_mcap_usd < (ath.ath_mcap_usd * 0.05))
)
SELECT
  token_mint,
  symbol,
  name,
  launchpad,
  creator_wallet,
  ath_usd,
  ath_at,
  current_mcap_usd,
  current_price_usd,
  latest_at,
  liquidity_usd,
  volume_24h,
  holder_count,
  health_grade,
  health_score,
  risk_label,
  dust_percentage,
  first_seen_at,
  last_seen_at,
  current_status,
  COALESCE(
    raw_death_cause,
    CASE
      WHEN current_mcap_usd < 1000::numeric THEN 'market_cap_under_1k'
      WHEN collapse_pct >= 0.95::numeric THEN 'chart_collapse_95'
      WHEN liquidity_usd IS NOT NULL AND liquidity_usd < 500::numeric THEN 'liquidity_drain'
      WHEN volume_24h IS NOT NULL AND volume_24h <= 25::numeric THEN 'dead_volume'
      ELSE 'chart_death'
    END
  ) AS death_cause,
  COALESCE(
    raw_death_confidence,
    CASE
      WHEN current_mcap_usd < 1000::numeric THEN 98
      WHEN collapse_pct >= 0.99::numeric THEN 97
      WHEN collapse_pct >= 0.95::numeric THEN 94
      WHEN liquidity_usd IS NOT NULL AND liquidity_usd < 500::numeric THEN 90
      WHEN volume_24h IS NOT NULL AND volume_24h <= 25::numeric THEN 88
      ELSE 85
    END
  ) AS death_confidence,
  COALESCE(raw_death_at, latest_at) AS death_at,
  collapse_pct,
  dollar_wipeout,
  (latest_at >= now() - interval '24 hours') AS is_recent
FROM enriched;

-- Unique index required for CONCURRENT refresh
CREATE UNIQUE INDEX mv_live_death_watch_pk
  ON public.mv_live_death_watch (token_mint);

-- Read-pattern indexes used by the admin UI (filter by is_recent, sort by dollar_wipeout DESC)
CREATE INDEX mv_live_death_watch_recent_wipeout
  ON public.mv_live_death_watch (is_recent, dollar_wipeout DESC);

-- 2) Re-point the existing view to the materialized snapshot so the
--    client (LiveDeathWatch.tsx) keeps working unchanged.
DROP VIEW IF EXISTS public.v_live_death_watch;
CREATE VIEW public.v_live_death_watch
WITH (security_invoker=on) AS
SELECT * FROM public.mv_live_death_watch;

COMMENT ON MATERIALIZED VIEW public.mv_live_death_watch IS
  'Precomputed Live Death Watch snapshot. Refreshed every 5 min by pg_cron job refresh-live-death-watch.';
COMMENT ON VIEW public.v_live_death_watch IS
  'Live Death Watch — thin wrapper over mv_live_death_watch (5-min refresh). Kept for client compatibility.';

-- 3) Manual refresh helper (admins / edge functions can call this for an immediate refresh).
CREATE OR REPLACE FUNCTION public.refresh_live_death_watch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_live_death_watch;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_live_death_watch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_live_death_watch() TO authenticated, service_role;

-- 4) Schedule the auto-refresh every 5 minutes.
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-live-death-watch');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh-live-death-watch',
  '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_live_death_watch;$$
);