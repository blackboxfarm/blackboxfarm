
-- 1. Health summary RPC: return the exact keys the dashboard reads, plus existing breakdown.
DROP FUNCTION IF EXISTS public.no_lube_health_summary();
CREATE OR REPLACE FUNCTION public.no_lube_health_summary()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    -- UI-facing keys (NoLubeHealthStrip)
    'in_flight', (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE ingest_status IN ('pending','in_process') AND ingest_status <> 'archived'),
    'in_process_stuck', (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE dev_wallet_source = 'in_process'
         AND in_process_since IS NOT NULL
         AND in_process_since < now() - interval '30 minutes'
         AND ingest_status <> 'archived'),
    'mesh_pending', (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE mesh_hydrated_at IS NULL
         AND ingest_completed_at IS NOT NULL
         AND ingest_status <> 'archived'),
    'push_success_24h', (SELECT count(DISTINCT token_mint) FROM no_lube_post_log
       WHERE posted = true AND posted_at >= now() - interval '24 hours'),
    'push_failures_24h', (SELECT count(*) FROM no_lube_post_log
       WHERE last_push_error IS NOT NULL
         AND updated_at >= now() - interval '24 hours'),
    'rugged_recent', (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE is_rugged = true
         AND updated_at >= now() - interval '24 hours'),
    -- Breakdown keys (legacy / future widgets)
    'pending', (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE ingest_status = 'pending' AND ingest_status <> 'archived'),
    'in_process', (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE dev_wallet_source = 'in_process' AND ingest_status <> 'archived'),
    'ingest_failed', (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE ingest_last_error IS NOT NULL AND ingest_status <> 'archived'),
    'creator_unresolvable', (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE creator_status = 'unresolvable' AND ingest_status <> 'archived'),
    'kyc_failed', (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE kyc_status = 'failed' AND ingest_status <> 'archived'),
    'mesh_failed', (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE mesh_promotion_status = 'failed' AND ingest_status <> 'archived'),
    'posted_1h', (SELECT count(DISTINCT token_mint) FROM no_lube_post_log
       WHERE posted = true AND posted_at >= now() - interval '1 hour')
  );
$$;

GRANT EXECUTE ON FUNCTION public.no_lube_health_summary() TO authenticated, service_role;

-- 2. Atomic bump_channel_failure with error class + retry_after.
DROP FUNCTION IF EXISTS public.bump_channel_failure(text);
DROP FUNCTION IF EXISTS public.bump_channel_failure(text, text, integer);
CREATE OR REPLACE FUNCTION public.bump_channel_failure(
  _kind text,
  _error_class text DEFAULT 'transient',
  _retry_after_seconds integer DEFAULT NULL,
  _error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.channel_health (profile_kind, consecutive_failures, total_failures, last_error, last_error_class, retry_after_at, updated_at)
  VALUES (
    _kind, 1, 1,
    LEFT(COALESCE(_error_message, _error_class), 500),
    _error_class,
    CASE WHEN _retry_after_seconds IS NOT NULL
         THEN now() + make_interval(secs => _retry_after_seconds)
         ELSE NULL END,
    now()
  )
  ON CONFLICT (profile_kind) DO UPDATE
    SET consecutive_failures = public.channel_health.consecutive_failures + 1,
        total_failures = public.channel_health.total_failures + 1,
        last_error = LEFT(COALESCE(EXCLUDED.last_error, public.channel_health.last_error), 500),
        last_error_class = EXCLUDED.last_error_class,
        retry_after_at = COALESCE(EXCLUDED.retry_after_at, public.channel_health.retry_after_at),
        updated_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.bump_channel_failure(text, text, integer, text) TO service_role;

-- 3. Trigger fires on INSERT too (currently only UPDATE OF dev_wallet_source).
DROP TRIGGER IF EXISTS trg_stamp_in_process_since ON public.telegram_insider_token_lifecycle;
CREATE OR REPLACE FUNCTION public.stamp_in_process_since()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.dev_wallet_source = 'in_process' AND NEW.in_process_since IS NULL THEN
      NEW.in_process_since := now();
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE
  IF NEW.dev_wallet_source = 'in_process'
     AND (OLD.dev_wallet_source IS DISTINCT FROM 'in_process') THEN
    NEW.in_process_since := now();
  ELSIF NEW.dev_wallet_source IS DISTINCT FROM 'in_process'
        AND OLD.dev_wallet_source = 'in_process' THEN
    NEW.in_process_since := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_stamp_in_process_since
  BEFORE INSERT OR UPDATE OF dev_wallet_source
  ON public.telegram_insider_token_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.stamp_in_process_since();
