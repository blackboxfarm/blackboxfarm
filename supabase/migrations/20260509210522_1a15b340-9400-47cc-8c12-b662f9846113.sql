CREATE TABLE IF NOT EXISTS public.solscan_api_calls (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  endpoint_path TEXT NOT NULL,
  function_name TEXT,
  http_status INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  from_cache BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  response_bytes INTEGER,
  mint_or_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_solscan_api_calls_ts ON public.solscan_api_calls (ts DESC);
CREATE INDEX IF NOT EXISTS idx_solscan_api_calls_endpoint ON public.solscan_api_calls (endpoint_path, ts DESC);
CREATE INDEX IF NOT EXISTS idx_solscan_api_calls_function ON public.solscan_api_calls (function_name, ts DESC);
CREATE INDEX IF NOT EXISTS idx_solscan_api_calls_status ON public.solscan_api_calls (http_status) WHERE http_status >= 400 OR http_status = 0;

ALTER TABLE public.solscan_api_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_solscan_calls"
  ON public.solscan_api_calls
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Auto-purge rows older than 30 days
CREATE OR REPLACE FUNCTION public.prune_solscan_api_calls()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.solscan_api_calls WHERE ts < now() - interval '30 days';
$$;