
-- 1. channel_health table
CREATE TABLE IF NOT EXISTS public.channel_health (
  profile_kind text PRIMARY KEY,
  last_ok_at timestamptz,
  last_error text,
  last_error_class text,
  consecutive_failures int NOT NULL DEFAULT 0,
  total_failures bigint NOT NULL DEFAULT 0,
  total_successes bigint NOT NULL DEFAULT 0,
  disabled_until timestamptz,
  retry_after_at timestamptz,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.channel_health TO authenticated;
GRANT ALL ON public.channel_health TO service_role;
ALTER TABLE public.channel_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel_health admin read" ON public.channel_health;
CREATE POLICY "channel_health admin read"
  ON public.channel_health FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "channel_health service write" ON public.channel_health;
CREATE POLICY "channel_health service write"
  ON public.channel_health FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. no_lube_post_log: push tracking + updated_at + in-flight lock
ALTER TABLE public.no_lube_post_log
  ADD COLUMN IF NOT EXISTS push_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_push_error text,
  ADD COLUMN IF NOT EXISTS last_push_error_class text,
  ADD COLUMN IF NOT EXISTS pushing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS no_lube_push_inflight_uniq
  ON public.no_lube_post_log (token_mint, channel, post_kind)
  WHERE posted IS NOT TRUE AND pushing_started_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_no_lube_post_log_touch ON public.no_lube_post_log;
CREATE TRIGGER trg_no_lube_post_log_touch
  BEFORE UPDATE ON public.no_lube_post_log
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_channel_health_touch ON public.channel_health;
CREATE TRIGGER trg_channel_health_touch
  BEFORE UPDATE ON public.channel_health
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. lifecycle: in_process_since + gate-block reason
ALTER TABLE public.telegram_insider_token_lifecycle
  ADD COLUMN IF NOT EXISTS in_process_since timestamptz,
  ADD COLUMN IF NOT EXISTS gate_block_reason text,
  ADD COLUMN IF NOT EXISTS gate_blocked_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_in_process_since()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_stamp_in_process_since ON public.telegram_insider_token_lifecycle;
CREATE TRIGGER trg_stamp_in_process_since
  BEFORE UPDATE OF dev_wallet_source ON public.telegram_insider_token_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.stamp_in_process_since();

-- 4. health summary RPC
CREATE OR REPLACE FUNCTION public.no_lube_health_summary()
RETURNS TABLE (
  pending bigint, in_process bigint, in_process_stale bigint,
  ingest_failed bigint, creator_unresolvable bigint, kyc_failed bigint, mesh_failed bigint,
  posted_1h bigint, posted_24h bigint, push_failed_24h bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE ingest_status IN ('pending','in_process') AND ingest_status <> 'archived'),
    (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE dev_wallet_source = 'in_process' AND ingest_status <> 'archived'),
    (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE dev_wallet_source = 'in_process'
         AND in_process_since IS NOT NULL
         AND in_process_since < now() - interval '30 minutes'
         AND ingest_status <> 'archived'),
    (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE ingest_last_error IS NOT NULL AND ingest_status <> 'archived'),
    (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE creator_status = 'unresolvable' AND ingest_status <> 'archived'),
    (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE kyc_status = 'failed' AND ingest_status <> 'archived'),
    (SELECT count(*) FROM telegram_insider_token_lifecycle
       WHERE mesh_promotion_status = 'failed' AND ingest_status <> 'archived'),
    (SELECT count(DISTINCT token_mint) FROM no_lube_post_log
       WHERE posted = true AND posted_at >= now() - interval '1 hour'),
    (SELECT count(DISTINCT token_mint) FROM no_lube_post_log
       WHERE posted = true AND posted_at >= now() - interval '24 hours'),
    (SELECT count(*) FROM no_lube_post_log
       WHERE last_push_error IS NOT NULL
         AND updated_at >= now() - interval '24 hours');
$$;

GRANT EXECUTE ON FUNCTION public.no_lube_health_summary() TO authenticated, service_role;

-- 5. Seed default rows for UI
INSERT INTO public.channel_health (profile_kind) VALUES ('default'), ('public'), ('private')
ON CONFLICT (profile_kind) DO NOTHING;
