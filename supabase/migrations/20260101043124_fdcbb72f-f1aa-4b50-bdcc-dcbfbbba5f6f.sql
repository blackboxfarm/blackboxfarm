-- Create discovery logs table to track all token scan decisions
CREATE TABLE IF NOT EXISTS public.pumpfun_discovery_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  decision TEXT NOT NULL, -- 'accepted', 'rejected', 'error'
  rejection_reason TEXT, -- 'low_volume', 'too_old', 'high_risk', 'bundled', 'scam_dev', 'existing', 'api_error'
  volume_sol NUMERIC,
  volume_usd NUMERIC,
  tx_count INTEGER,
  bundle_score NUMERIC,
  holder_count INTEGER,
  age_minutes NUMERIC,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for recent logs query
CREATE INDEX idx_pumpfun_discovery_logs_created_at ON public.pumpfun_discovery_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.pumpfun_discovery_logs ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Discovery logs are publicly readable"
  ON public.pumpfun_discovery_logs
  FOR SELECT
  USING (true);

-- Allow insert from service role (edge functions)
CREATE POLICY "Service can insert discovery logs"
  ON public.pumpfun_discovery_logs
  FOR INSERT
  WITH CHECK (true);

-- Auto-cleanup: only keep last 24 hours of logs (via cron or manual)
COMMENT ON TABLE public.pumpfun_discovery_logs IS 'Tracks all pump.fun token scan decisions for observability';