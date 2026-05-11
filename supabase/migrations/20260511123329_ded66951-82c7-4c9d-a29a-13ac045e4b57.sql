
CREATE TABLE IF NOT EXISTS public.birdeye_api_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  function_name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  request_params JSONB,
  response_status INTEGER,
  response_time_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  credits_used INTEGER NOT NULL DEFAULT 1,
  token_mint TEXT,
  resolved_creator TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_birdeye_api_usage_timestamp ON public.birdeye_api_usage (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_birdeye_api_usage_function ON public.birdeye_api_usage (function_name, timestamp DESC);
ALTER TABLE public.birdeye_api_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read birdeye usage"
  ON public.birdeye_api_usage FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role writes birdeye usage"
  ON public.birdeye_api_usage FOR INSERT TO service_role WITH CHECK (true);
