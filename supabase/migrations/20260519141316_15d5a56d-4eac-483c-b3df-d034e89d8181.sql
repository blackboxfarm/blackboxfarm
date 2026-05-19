-- Live per-API-call audit log for allstar mint detection
CREATE TABLE IF NOT EXISTS public.allstar_audit_check_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  master_wallet TEXT NOT NULL,
  family_wallet TEXT,
  source TEXT NOT NULL,                 -- 'helius' | 'solscan' | 'pumpfun' | 'other'
  status TEXT NOT NULL,                 -- 'ok' | 'rate_limited' | 'error' | 'new_mint' | 'skip'
  latency_ms INTEGER,
  error_msg TEXT,
  mint_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_check_log_ts        ON public.allstar_audit_check_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_check_log_status_ts ON public.allstar_audit_check_log (status, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_check_log_master    ON public.allstar_audit_check_log (master_wallet, ts DESC);

ALTER TABLE public.allstar_audit_check_log ENABLE ROW LEVEL SECURITY;

-- Super admins can read
CREATE POLICY "Super admins read audit check log"
  ON public.allstar_audit_check_log
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Service role only insert (no policy needed; service role bypasses RLS)
-- No update / delete policies → blocked for everyone except service role.

-- Realtime
ALTER TABLE public.allstar_audit_check_log REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'allstar_audit_check_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.allstar_audit_check_log';
  END IF;
END$$;

-- Prune function: keep 24h
CREATE OR REPLACE FUNCTION public.prune_allstar_audit_check_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.allstar_audit_check_log WHERE ts < now() - interval '24 hours';
END;
$$;