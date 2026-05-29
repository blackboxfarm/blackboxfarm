CREATE OR REPLACE FUNCTION public.prune_log_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_api_usage      integer := 0;
  v_helius_usage   integer := 0;
  v_activity_logs  integer := 0;
  v_arb_snaps      integer := 0;
  v_arb_opps       integer := 0;
BEGIN
  DELETE FROM public.api_usage_log
   WHERE timestamp < now() - interval '7 days';
  GET DIAGNOSTICS v_api_usage = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='helius_api_usage') THEN
    EXECUTE $sql$ DELETE FROM public.helius_api_usage
                   WHERE timestamp < now() - interval '7 days' $sql$;
    GET DIAGNOSTICS v_helius_usage = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='activity_logs') THEN
    EXECUTE $sql$ DELETE FROM public.activity_logs
                   WHERE timestamp < now() - interval '30 days' $sql$;
    GET DIAGNOSTICS v_activity_logs = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='arb_price_snapshots') THEN
    EXECUTE $sql$ DELETE FROM public.arb_price_snapshots
                   WHERE timestamp < now() - interval '3 days' $sql$;
    GET DIAGNOSTICS v_arb_snaps = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='arb_opportunities') THEN
    EXECUTE $sql$ DELETE FROM public.arb_opportunities
                   WHERE detected_at < now() - interval '14 days' $sql$;
    GET DIAGNOSTICS v_arb_opps = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'api_usage_log',       v_api_usage,
    'helius_api_usage',    v_helius_usage,
    'activity_logs',       v_activity_logs,
    'arb_price_snapshots', v_arb_snaps,
    'arb_opportunities',   v_arb_opps,
    'pruned_at',           now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.prune_log_tables() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('prune-log-tables-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'prune-log-tables-daily',
  '0 3 * * *',
  $$ SELECT public.prune_log_tables(); $$
);

SELECT public.prune_log_tables();