-- ============================================
-- API Usage Logging System
-- ============================================

-- Create api_usage_log table for tracking all external API calls
CREATE TABLE public.api_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
  service_name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  token_mint TEXT,
  function_name TEXT,
  request_type TEXT,
  response_status INTEGER,
  response_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  credits_used NUMERIC DEFAULT 0,
  is_cached BOOLEAN DEFAULT false,
  user_id UUID,
  session_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for efficient querying
CREATE INDEX idx_api_usage_log_timestamp ON public.api_usage_log(timestamp DESC);
CREATE INDEX idx_api_usage_log_service_name ON public.api_usage_log(service_name);
CREATE INDEX idx_api_usage_log_token_mint ON public.api_usage_log(token_mint);
CREATE INDEX idx_api_usage_log_function_name ON public.api_usage_log(function_name);
CREATE INDEX idx_api_usage_log_service_timestamp ON public.api_usage_log(service_name, timestamp DESC);

-- Create token_analysis_costs aggregate table
CREATE TABLE public.token_analysis_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  analysis_date DATE DEFAULT CURRENT_DATE,
  total_api_calls INTEGER DEFAULT 0,
  helius_credits INTEGER DEFAULT 0,
  solscan_credits INTEGER DEFAULT 0,
  dexscreener_calls INTEGER DEFAULT 0,
  rugcheck_calls INTEGER DEFAULT 0,
  pumpfun_calls INTEGER DEFAULT 0,
  jupiter_calls INTEGER DEFAULT 0,
  coingecko_calls INTEGER DEFAULT 0,
  total_response_time_ms INTEGER DEFAULT 0,
  holder_count INTEGER,
  user_id UUID,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create unique index with NULL handling
CREATE UNIQUE INDEX idx_token_analysis_unique ON public.token_analysis_costs(token_mint, analysis_date, COALESCE(session_id, 'anonymous'));

-- Create indexes for token_analysis_costs
CREATE INDEX idx_token_analysis_costs_token_mint ON public.token_analysis_costs(token_mint);
CREATE INDEX idx_token_analysis_costs_date ON public.token_analysis_costs(analysis_date DESC);

-- Enable RLS
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_analysis_costs ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Only super admins can read
CREATE POLICY "Super admins can view api_usage_log"
ON public.api_usage_log
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Edge functions can insert api_usage_log"
ON public.api_usage_log
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

CREATE POLICY "Super admins can view token_analysis_costs"
ON public.token_analysis_costs
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Edge functions can insert token_analysis_costs"
ON public.token_analysis_costs
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

CREATE POLICY "Edge functions can update token_analysis_costs"
ON public.token_analysis_costs
FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- Create RPC function for dashboard stats
CREATE OR REPLACE FUNCTION public.get_api_usage_stats(
  p_start_date TIMESTAMPTZ DEFAULT (now() - INTERVAL '7 days'),
  p_end_date TIMESTAMPTZ DEFAULT now(),
  p_service_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_calls BIGINT,
  total_credits NUMERIC,
  successful_calls BIGINT,
  failed_calls BIGINT,
  avg_response_time_ms NUMERIC,
  calls_by_service JSONB,
  calls_by_day JSONB,
  top_tokens JSONB,
  credits_by_service JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Super admin required';
  END IF;

  RETURN QUERY
  WITH filtered_logs AS (
    SELECT * FROM api_usage_log aul
    WHERE aul.timestamp BETWEEN p_start_date AND p_end_date
      AND (p_service_name IS NULL OR aul.service_name = p_service_name)
  ),
  stats AS (
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(fl.credits_used), 0) as credits,
      COUNT(*) FILTER (WHERE fl.success = true) as successful,
      COUNT(*) FILTER (WHERE fl.success = false) as failed,
      COALESCE(AVG(fl.response_time_ms), 0) as avg_time
    FROM filtered_logs fl
  ),
  by_service AS (
    SELECT jsonb_object_agg(
      fl.service_name,
      jsonb_build_object(
        'calls', count,
        'credits', credits,
        'avg_time_ms', avg_time,
        'success_rate', CASE WHEN count > 0 THEN ROUND((successful::NUMERIC / count) * 100, 1) ELSE 0 END
      )
    ) as data
    FROM (
      SELECT
        fl.service_name,
        COUNT(*) as count,
        COALESCE(SUM(fl.credits_used), 0) as credits,
        ROUND(COALESCE(AVG(fl.response_time_ms), 0)::NUMERIC, 2) as avg_time,
        COUNT(*) FILTER (WHERE fl.success = true) as successful
      FROM filtered_logs fl
      GROUP BY fl.service_name
      ORDER BY count DESC
    ) fl
  ),
  by_day AS (
    SELECT jsonb_object_agg(
      day::text,
      jsonb_build_object('calls', calls, 'credits', credits)
    ) as data
    FROM (
      SELECT
        DATE(fl.timestamp) as day,
        COUNT(*) as calls,
        COALESCE(SUM(fl.credits_used), 0) as credits
      FROM filtered_logs fl
      GROUP BY DATE(fl.timestamp)
      ORDER BY day DESC
    ) fl
  ),
  top_tokens_data AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'token_mint', token_mint,
        'calls', calls,
        'credits', credits
      )
      ORDER BY calls DESC
    ) as data
    FROM (
      SELECT
        fl.token_mint,
        COUNT(*) as calls,
        COALESCE(SUM(fl.credits_used), 0) as credits
      FROM filtered_logs fl
      WHERE fl.token_mint IS NOT NULL
      GROUP BY fl.token_mint
      ORDER BY calls DESC
      LIMIT 20
    ) fl
  ),
  credits_by_service AS (
    SELECT jsonb_object_agg(
      fl.service_name,
      credits
    ) as data
    FROM (
      SELECT
        fl.service_name,
        COALESCE(SUM(fl.credits_used), 0) as credits
      FROM filtered_logs fl
      WHERE fl.credits_used > 0
      GROUP BY fl.service_name
      ORDER BY credits DESC
    ) fl
  )
  SELECT
    s.total,
    s.credits,
    s.successful,
    s.failed,
    ROUND(s.avg_time::NUMERIC, 2),
    COALESCE(bs.data, '{}'::jsonb),
    COALESCE(bd.data, '{}'::jsonb),
    COALESCE(tt.data, '[]'::jsonb),
    COALESCE(cbs.data, '{}'::jsonb)
  FROM stats s
  CROSS JOIN by_service bs
  CROSS JOIN by_day bd
  CROSS JOIN top_tokens_data tt
  CROSS JOIN credits_by_service cbs;
END;
$$;