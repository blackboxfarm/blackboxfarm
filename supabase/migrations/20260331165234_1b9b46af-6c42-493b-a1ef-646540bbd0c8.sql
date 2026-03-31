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
  deleted_count BIGINT := 0;
  batch_deleted BIGINT;
  batch_limit INT := 50000;
  max_batches INT := 100;
  i INT := 0;
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

  LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE ctid = ANY(ARRAY(SELECT ctid FROM %I WHERE %I < $1 LIMIT %s))',
      p_table, p_table, p_column, batch_limit
    ) USING p_cutoff;
    
    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    deleted_count := deleted_count + batch_deleted;
    i := i + 1;
    
    EXIT WHEN batch_deleted = 0 OR i >= max_batches;
  END LOOP;
  
  RETURN deleted_count;
END;
$$;