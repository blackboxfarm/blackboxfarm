CREATE OR REPLACE FUNCTION public.aggregate_holder_data_batch(p_older_than_days integer DEFAULT 14, p_batch_days integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $$
DECLARE
  cutoff_date date := CURRENT_DATE - p_older_than_days;
  batch_dates date[];
  d date;
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
  aggregated_count integer := 0;
  snapshot_deleted integer := 0;
  movement_deleted integer := 0;
  batch_snap_del integer;
  batch_mv_del integer;
BEGIN
  SELECT array_agg(sd ORDER BY sd) INTO batch_dates
  FROM (
    SELECT DISTINCT snapshot_date AS sd
    FROM holder_snapshots
    WHERE snapshot_date < cutoff_date
    ORDER BY snapshot_date
    LIMIT p_batch_days
  ) sub;

  IF batch_dates IS NULL OR array_length(batch_dates, 1) IS NULL THEN
    RETURN jsonb_build_object('aggregated_token_days', 0, 'snapshots_deleted', 0, 'movements_deleted', 0, 'message', 'nothing to aggregate');
  END IF;

  FOREACH d IN ARRAY batch_dates LOOP
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
      WHERE hs.snapshot_date = d
      GROUP BY hs.token_mint, hs.snapshot_date
    LOOP
      top10_pct := 0; top25_pct := 0;
      SELECT SUM(balance) INTO total_supply FROM holder_snapshots WHERE token_mint = r.token_mint AND snapshot_date = d;
      IF total_supply IS NOT NULL AND total_supply > 0 THEN
        SELECT COALESCE(SUM(sub.balance) / total_supply * 100, 0) INTO top10_pct
        FROM (SELECT balance FROM holder_snapshots WHERE token_mint = r.token_mint AND snapshot_date = d ORDER BY balance DESC LIMIT 10) sub;
        SELECT COALESCE(SUM(sub.balance) / total_supply * 100, 0) INTO top25_pct
        FROM (SELECT balance FROM holder_snapshots WHERE token_mint = r.token_mint AND snapshot_date = d ORDER BY balance DESC LIMIT 25) sub;
      END IF;

      SELECT
        COUNT(*) FILTER (WHERE action = 'buy'),
        COUNT(*) FILTER (WHERE action = 'sell'),
        COUNT(*) FILTER (WHERE action = 'accumulate'),
        COUNT(*) FILTER (WHERE action = 'distribute'),
        COALESCE(SUM(CASE WHEN action IN ('buy','accumulate') THEN usd_value ELSE -usd_value END), 0),
        COUNT(*) FILTER (WHERE tier ILIKE '%whale%')
      INTO mv_buys, mv_sells, mv_acc, mv_dist, mv_net, mv_whale
      FROM holder_movements WHERE token_mint = r.token_mint AND detected_at::date = d;

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
        whale_count = EXCLUDED.whale_count, shark_count = EXCLUDED.shark_count,
        dolphin_count = EXCLUDED.dolphin_count, fish_count = EXCLUDED.fish_count,
        shrimp_count = EXCLUDED.shrimp_count,
        total_usd_value = EXCLUDED.total_usd_value, avg_balance = EXCLUDED.avg_balance,
        median_balance = EXCLUDED.median_balance, price_at_snapshot = EXCLUDED.price_at_snapshot,
        buys = EXCLUDED.buys, sells = EXCLUDED.sells,
        accumulations = EXCLUDED.accumulations, distributions = EXCLUDED.distributions,
        net_flow_usd = EXCLUDED.net_flow_usd, whale_movements = EXCLUDED.whale_movements;

      aggregated_count := aggregated_count + 1;
    END LOOP;

    DELETE FROM holder_snapshots WHERE snapshot_date = d;
    GET DIAGNOSTICS batch_snap_del = ROW_COUNT;
    snapshot_deleted := snapshot_deleted + batch_snap_del;

    DELETE FROM holder_movements WHERE detected_at::date = d;
    GET DIAGNOSTICS batch_mv_del = ROW_COUNT;
    movement_deleted := movement_deleted + batch_mv_del;
  END LOOP;

  RETURN jsonb_build_object(
    'aggregated_token_days', aggregated_count,
    'snapshots_deleted', snapshot_deleted,
    'movements_deleted', movement_deleted,
    'days_processed', array_length(batch_dates, 1),
    'cutoff_date', cutoff_date
  );
END;
$$;