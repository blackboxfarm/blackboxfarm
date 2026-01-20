-- Create table for CoinGecko error alerts and fallback tracking
CREATE TABLE public.coingecko_error_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_code TEXT NOT NULL, -- RATE_LIMIT, AUTH_FAILED, SERVER_ERROR, TIMEOUT, NETWORK, INVALID_RESPONSE, UNKNOWN
  http_status INTEGER,
  message TEXT,
  endpoint TEXT,
  tier TEXT, -- pro, demo, free
  retry_after_seconds INTEGER,
  severity TEXT DEFAULT 'low', -- low, medium, high, critical
  context TEXT, -- which function triggered this
  fallback_source TEXT, -- jupiter, dexscreener (if fallback was used)
  fallback_price NUMERIC, -- price from fallback source
  notified_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for dashboard queries (recent errors by code)
CREATE INDEX idx_coingecko_alerts_code_time ON public.coingecko_error_alerts(error_code, created_at DESC);

-- Index for severity filtering
CREATE INDEX idx_coingecko_alerts_severity ON public.coingecko_error_alerts(severity, created_at DESC);

-- Index for context filtering (which functions are having issues)
CREATE INDEX idx_coingecko_alerts_context ON public.coingecko_error_alerts(context, created_at DESC);

-- Enable RLS (admin only table)
ALTER TABLE public.coingecko_error_alerts ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions)
CREATE POLICY "Service role can manage alerts" 
ON public.coingecko_error_alerts 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE public.coingecko_error_alerts IS 'Tracks CoinGecko API errors, rate limits, and fallback activations for monitoring';
COMMENT ON COLUMN public.coingecko_error_alerts.error_code IS 'Classified error type: RATE_LIMIT, AUTH_FAILED, SERVER_ERROR, TIMEOUT, NETWORK, INVALID_RESPONSE, UNKNOWN';
COMMENT ON COLUMN public.coingecko_error_alerts.fallback_source IS 'Price source used as fallback when CoinGecko failed: jupiter, dexscreener';
COMMENT ON COLUMN public.coingecko_error_alerts.resolved_at IS 'When the issue was resolved (e.g., fallback worked or retry succeeded)';