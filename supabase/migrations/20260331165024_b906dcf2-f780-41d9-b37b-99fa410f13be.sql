CREATE OR REPLACE FUNCTION public.bulk_prune_table(
  p_table TEXT,
  p_column TEXT,
  p_cutoff TIMESTAMPTZ
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  IF p_table NOT IN (
    'api_usage_log', 'activity_logs', 'arb_opportunities', 'arb_price_snapshots',
    'admin_notifications', 'banner_impressions', 'banner_clicks', 'helius_api_usage',
    'holder_movements', 'holder_snapshots', 'token_rankings'
  ) THEN
    RAISE EXCEPTION 'Table % is not in the allowed prune list', p_table;
  END IF;

  IF p_column NOT IN (
    'timestamp', 'detected_at', 'created_at', 'captured_at', 'snapshot_date'
  ) THEN
    RAISE EXCEPTION 'Column % is not in the allowed column list', p_column;
  END IF;

  EXECUTE format('DELETE FROM %I WHERE %I < $1', p_table, p_column)
  USING p_cutoff;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;