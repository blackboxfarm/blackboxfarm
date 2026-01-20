-- Create table to track SOL price fetch attempts and failures
CREATE TABLE public.sol_price_fetch_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_name TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  price_fetched NUMERIC(12, 4) NULL,
  response_time_ms INTEGER NULL,
  error_message TEXT NULL,
  error_type TEXT NULL,
  http_status INTEGER NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_sol_price_logs_created_at ON public.sol_price_fetch_logs(created_at DESC);
CREATE INDEX idx_sol_price_logs_source ON public.sol_price_fetch_logs(source_name, success);

-- Enable RLS but allow service role full access
ALTER TABLE public.sol_price_fetch_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert
CREATE POLICY "Service role can insert logs"
ON public.sol_price_fetch_logs
FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow authenticated users to read (for dashboard)
CREATE POLICY "Authenticated users can read logs"
ON public.sol_price_fetch_logs
FOR SELECT
TO authenticated
USING (true);

-- Create a view for easy stats
CREATE OR REPLACE VIEW public.sol_price_source_stats AS
SELECT 
  source_name,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE success = true) as successes,
  COUNT(*) FILTER (WHERE success = false) as failures,
  ROUND(100.0 * COUNT(*) FILTER (WHERE success = true) / NULLIF(COUNT(*), 0), 2) as success_rate_pct,
  ROUND(AVG(response_time_ms) FILTER (WHERE success = true), 0) as avg_success_time_ms,
  MAX(created_at) as last_attempt_at
FROM public.sol_price_fetch_logs
WHERE created_at > now() - interval '24 hours'
GROUP BY source_name
ORDER BY success_rate_pct DESC, avg_success_time_ms ASC;