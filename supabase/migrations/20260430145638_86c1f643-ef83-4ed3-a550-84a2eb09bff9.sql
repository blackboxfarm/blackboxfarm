-- ============================================================
-- 1. autopsy_backlog: one-shot historical "cool deaths" pool
-- ============================================================
CREATE TABLE IF NOT EXISTS public.autopsy_backlog (
  token_mint        text PRIMARY KEY,
  symbol            text,
  name              text,
  launchpad         text,
  ath_usd           numeric,
  ath_at            timestamptz,
  current_mcap_usd  numeric,
  current_price_usd numeric,
  liquidity_usd     numeric,
  holder_count      integer,
  creator_wallet    text,
  death_cause       text,
  death_confidence  integer,
  death_at          timestamptz,
  collapse_pct      numeric,
  drafted_slug      text,
  drafted_at        timestamptz,
  is_frozen         boolean NOT NULL DEFAULT true,
  captured_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autopsy_backlog_ath ON public.autopsy_backlog (ath_usd DESC);
CREATE INDEX IF NOT EXISTS idx_autopsy_backlog_cause ON public.autopsy_backlog (death_cause);
CREATE INDEX IF NOT EXISTS idx_autopsy_backlog_drafted ON public.autopsy_backlog (drafted_at);

ALTER TABLE public.autopsy_backlog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autopsy_backlog admin select"
  ON public.autopsy_backlog FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "autopsy_backlog admin insert"
  ON public.autopsy_backlog FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "autopsy_backlog admin update"
  ON public.autopsy_backlog FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

COMMENT ON TABLE public.autopsy_backlog IS
  'One-shot frozen pool of historical "cool deaths" for Tier-B autopsy backfill. Built once by autopsy-backlog-builder; is_frozen=true blocks re-runs.';

-- ============================================================
-- 2. v_live_death_watch: active tokens showing death signals
-- ============================================================
CREATE OR REPLACE VIEW public.v_live_death_watch
WITH (security_invoker = on) AS
WITH latest_snap AS (
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
  tl.token_mint,
  tl.symbol,
  tl.name,
  tl.launchpad,
  tl.creator_wallet,
  tl.ath_24h_usd                                             AS ath_usd,
  tl.market_cap                                              AS current_mcap_usd,
  tl.price_usd                                               AS current_price_usd,
  tl.liquidity_usd,
  tl.first_seen_at,
  tl.last_seen_at,
  tl.current_status,
  tl.death_cause,
  tl.death_confidence,
  tl.autopsy_at                                              AS death_at,
  COALESCE(ls.total_holders, pw.holder_count)                AS holder_count,
  ls.health_grade,
  ls.health_score,
  ls.risk_label,
  ls.dust_percentage,
  CASE
    WHEN tl.ath_24h_usd IS NOT NULL AND tl.ath_24h_usd > 0 AND tl.market_cap IS NOT NULL
      THEN GREATEST(0::numeric, LEAST(1::numeric, 1 - (tl.market_cap / tl.ath_24h_usd)))
    ELSE NULL
  END                                                         AS collapse_pct,
  COALESCE(tl.ath_24h_usd, 0) *
    CASE
      WHEN tl.ath_24h_usd IS NOT NULL AND tl.ath_24h_usd > 0 AND tl.market_cap IS NOT NULL
        THEN GREATEST(0::numeric, LEAST(1::numeric, 1 - (tl.market_cap / tl.ath_24h_usd)))
      ELSE 0
    END                                                       AS dollar_wipeout
FROM public.token_lifecycle tl
LEFT JOIN latest_snap ls ON ls.token_mint = tl.token_mint
LEFT JOIN public.pumpfun_watchlist pw ON pw.token_mint = tl.token_mint
WHERE
  (
    tl.market_cap < 1000
    OR tl.liquidity_usd < 500
    OR (tl.ath_24h_usd >= 50000 AND tl.market_cap < tl.ath_24h_usd * 0.05)
    OR tl.death_cause IS NOT NULL
  );

COMMENT ON VIEW public.v_live_death_watch IS
  'Active tokens showing death signals. Source for the Autopsy Live Death Watch admin tab. Joins token_lifecycle + latest token_health_snapshot + pumpfun_watchlist.';