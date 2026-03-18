-- Aggregated daily summary for holder data (replaces per-wallet rows after retention window)
CREATE TABLE IF NOT EXISTS public.holder_daily_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  summary_date date NOT NULL,
  total_holders integer NOT NULL DEFAULT 0,
  top10_holder_pct numeric(8,4) DEFAULT 0,
  top25_holder_pct numeric(8,4) DEFAULT 0,
  whale_count integer DEFAULT 0,
  shark_count integer DEFAULT 0,
  dolphin_count integer DEFAULT 0,
  fish_count integer DEFAULT 0,
  shrimp_count integer DEFAULT 0,
  total_usd_value numeric DEFAULT 0,
  avg_balance numeric DEFAULT 0,
  median_balance numeric DEFAULT 0,
  price_at_snapshot numeric DEFAULT 0,
  buys integer DEFAULT 0,
  sells integer DEFAULT 0,
  accumulations integer DEFAULT 0,
  distributions integer DEFAULT 0,
  net_flow_usd numeric DEFAULT 0,
  whale_movements integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(token_mint, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_holder_daily_summary_token ON public.holder_daily_summary(token_mint, summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_holder_daily_summary_date ON public.holder_daily_summary(summary_date DESC);

ALTER TABLE public.holder_daily_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view holder summaries" ON public.holder_daily_summary FOR SELECT USING (true);
CREATE POLICY "Service role can insert holder summaries" ON public.holder_daily_summary FOR INSERT WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Aggregation function: summarize snapshots + movements for dates older than retention window, then purge raw rows
CREATE OR REPLACE FUNCTION public.aggregate_holder_data(p_older_than_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cutoff_date date := CURRENT_DATE - p_older_than_days;
  aggregated_count integer := 0;
  snapshot_deleted integer := 0;
  movement_deleted integer := 0;
  r record;
  top10_pct numeric;
  top25_pct numeric;
  total_supply numeric;
  mv_buys integer;
  mv_sells integer;
  mv_acc integer;
  mv_dist integer;
  mv_net numeric;
  mv_whale integer;
BEGIN
  -- Loop through each unique token+date combo older than cutoff
  FOR r IN
    SELECT
      hs.token_mint,
      hs.snapshot_date,
      COUNT(DISTINCT hs.wallet_address) AS total_holders,
      COUNT(*) FILTER (WHERE hs.tier ILIKE '%whale%') AS whale_count,
      COUNT(*) FILTER (WHERE hs.tier ILIKE '%shark%') AS shark_count,
      COUNT(*) FILTER (WHERE hs.tier ILIKE '%dolphin%') AS dolphin_count,
      COUNT(*) FILTER (WHERE hs.tier ILIKE '%fish%' AND hs.tier NOT ILIKE '%shrimp%') AS fish_count,
      COUNT(*) FILTER (WHERE hs.tier ILIKE '%shrimp%' OR hs.tier ILIKE '%dust%' OR hs.tier ILIKE '%micro%') AS shrimp_count,
      COALESCE(SUM(hs.usd_value), 0) AS total_usd_value,
      COALESCE(AVG(hs.balance), 0) AS avg_balance,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hs.balance), 0) AS median_balance,
      COALESCE(MAX(hs.price_at_snapshot), 0) AS price_at_snapshot
    FROM holder_snapshots hs
    WHERE hs.snapshot_date < cutoff_date
    GROUP BY hs.token_mint, hs.snapshot_date
  LOOP
    -- Top 10/25 concentration
    top10_pct := 0;
    top25_pct := 0;

    SELECT SUM(balance) INTO total_supply
    FROM holder_snapshots
    WHERE token_mint = r.token_mint AND snapshot_date = r.snapshot_date;

    IF total_supply IS NOT NULL AND total_supply > 0 THEN
      SELECT COALESCE(SUM(sub.balance) / total_supply * 100, 0) INTO top10_pct
      FROM (SELECT balance FROM holder_snapshots WHERE token_mint = r.token_mint AND snapshot_date = r.snapshot_date ORDER BY balance DESC LIMIT 10) sub;

      SELECT COALESCE(SUM(sub.balance) / total_supply * 100, 0) INTO top25_pct
      FROM (SELECT balance FROM holder_snapshots WHERE token_mint = r.token_mint AND snapshot_date = r.snapshot_date ORDER BY balance DESC LIMIT 25) sub;
    END IF;

    -- Movement stats for that token+date
    SELECT
      COUNT(*) FILTER (WHERE action = 'buy'),
      COUNT(*) FILTER (WHERE action = 'sell'),
      COUNT(*) FILTER (WHERE action = 'accumulate'),
      COUNT(*) FILTER (WHERE action = 'distribute'),
      COALESCE(SUM(CASE WHEN action IN ('buy','accumulate') THEN usd_value ELSE -usd_value END), 0),
      COUNT(*) FILTER (WHERE tier ILIKE '%whale%')
    INTO mv_buys, mv_sells, mv_acc, mv_dist, mv_net, mv_whale
    FROM holder_movements
    WHERE token_mint = r.token_mint
      AND detected_at::date = r.snapshot_date;

    INSERT INTO holder_daily_summary (
      token_mint, summary_date, total_holders,
      top10_holder_pct, top25_holder_pct,
      whale_count, shark_count, dolphin_count, fish_count, shrimp_count,
      total_usd_value, avg_balance, median_balance, price_at_snapshot,
      buys, sells, accumulations, distributions, net_flow_usd, whale_movements
    ) VALUES (
      r.token_mint, r.snapshot_date, r.total_holders,
      top10_pct, top25_pct,
      r.whale_count, r.shark_count, r.dolphin_count, r.fish_count, r.shrimp_count,
      r.total_usd_value, r.avg_balance, r.median_balance, r.price_at_snapshot,
      mv_buys, mv_sells, mv_acc, mv_dist, mv_net, mv_whale
    )
    ON CONFLICT (token_mint, summary_date) DO UPDATE SET
      total_holders = EXCLUDED.total_holders,
      top10_holder_pct = EXCLUDED.top10_holder_pct,
      top25_holder_pct = EXCLUDED.top25_holder_pct,
      whale_count = EXCLUDED.whale_count,
      shark_count = EXCLUDED.shark_count,
      dolphin_count = EXCLUDED.dolphin_count,
      fish_count = EXCLUDED.fish_count,
      shrimp_count = EXCLUDED.shrimp_count,
      total_usd_value = EXCLUDED.total_usd_value,
      avg_balance = EXCLUDED.avg_balance,
      median_balance = EXCLUDED.median_balance,
      price_at_snapshot = EXCLUDED.price_at_snapshot,
      buys = EXCLUDED.buys,
      sells = EXCLUDED.sells,
      accumulations = EXCLUDED.accumulations,
      distributions = EXCLUDED.distributions,
      net_flow_usd = EXCLUDED.net_flow_usd,
      whale_movements = EXCLUDED.whale_movements;

    aggregated_count := aggregated_count + 1;
  END LOOP;

  -- Purge old per-wallet rows
  DELETE FROM holder_snapshots WHERE snapshot_date < cutoff_date;
  GET DIAGNOSTICS snapshot_deleted = ROW_COUNT;

  DELETE FROM holder_movements WHERE detected_at::date < cutoff_date;
  GET DIAGNOSTICS movement_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'aggregated_token_days', aggregated_count,
    'snapshots_deleted', snapshot_deleted,
    'movements_deleted', movement_deleted,
    'cutoff_date', cutoff_date
  );
END;
$$;
