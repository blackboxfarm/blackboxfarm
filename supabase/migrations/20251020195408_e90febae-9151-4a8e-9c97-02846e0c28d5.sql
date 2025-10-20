-- Create Helius API usage tracking table
CREATE TABLE IF NOT EXISTS public.helius_api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  endpoint text NOT NULL,
  method text,
  request_params jsonb,
  response_status integer,
  response_time_ms integer,
  success boolean NOT NULL,
  error_message text,
  user_id uuid,
  ip_address text,
  credits_used integer DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_helius_usage_timestamp ON public.helius_api_usage(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_helius_usage_function ON public.helius_api_usage(function_name);
CREATE INDEX IF NOT EXISTS idx_helius_usage_user ON public.helius_api_usage(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_helius_usage_ip ON public.helius_api_usage(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_helius_usage_created ON public.helius_api_usage(created_at DESC);

-- Enable RLS
ALTER TABLE public.helius_api_usage ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can view their own usage
CREATE POLICY "Users can view their own API usage"
  ON public.helius_api_usage
  FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() IS NOT NULL);

-- Policy: Service role can insert usage logs
CREATE POLICY "Service role can insert usage logs"
  ON public.helius_api_usage
  FOR INSERT
  WITH CHECK (true);

-- Create function to get usage statistics
CREATE OR REPLACE FUNCTION public.get_helius_usage_stats(
  p_start_date timestamptz DEFAULT NOW() - INTERVAL '7 days',
  p_end_date timestamptz DEFAULT NOW(),
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_calls bigint,
  total_credits bigint,
  successful_calls bigint,
  failed_calls bigint,
  avg_response_time_ms numeric,
  calls_by_function jsonb,
  calls_by_day jsonb,
  top_ips jsonb,
  hourly_distribution jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*) as total,
      SUM(credits_used) as credits,
      COUNT(*) FILTER (WHERE success = true) as successful,
      COUNT(*) FILTER (WHERE success = false) as failed,
      AVG(response_time_ms) as avg_time
    FROM helius_api_usage
    WHERE timestamp BETWEEN p_start_date AND p_end_date
      AND (p_user_id IS NULL OR user_id = p_user_id)
  ),
  by_function AS (
    SELECT jsonb_object_agg(
      function_name,
      jsonb_build_object(
        'calls', count,
        'credits', credits,
        'avg_time_ms', avg_time
      )
    ) as data
    FROM (
      SELECT
        function_name,
        COUNT(*) as count,
        SUM(credits_used) as credits,
        ROUND(AVG(response_time_ms)::numeric, 2) as avg_time
      FROM helius_api_usage
      WHERE timestamp BETWEEN p_start_date AND p_end_date
        AND (p_user_id IS NULL OR user_id = p_user_id)
      GROUP BY function_name
      ORDER BY count DESC
    ) t
  ),
  by_day AS (
    SELECT jsonb_object_agg(
      day::text,
      count
    ) as data
    FROM (
      SELECT
        DATE(timestamp) as day,
        COUNT(*) as count
      FROM helius_api_usage
      WHERE timestamp BETWEEN p_start_date AND p_end_date
        AND (p_user_id IS NULL OR user_id = p_user_id)
      GROUP BY DATE(timestamp)
      ORDER BY day DESC
    ) t
  ),
  by_ip AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'ip', ip_address,
        'calls', count
      )
      ORDER BY count DESC
    ) as data
    FROM (
      SELECT
        COALESCE(ip_address, 'unknown') as ip_address,
        COUNT(*) as count
      FROM helius_api_usage
      WHERE timestamp BETWEEN p_start_date AND p_end_date
        AND (p_user_id IS NULL OR user_id = p_user_id)
      GROUP BY ip_address
      ORDER BY count DESC
      LIMIT 10
    ) t
  ),
  by_hour AS (
    SELECT jsonb_object_agg(
      hour::text,
      count
    ) as data
    FROM (
      SELECT
        EXTRACT(HOUR FROM timestamp) as hour,
        COUNT(*) as count
      FROM helius_api_usage
      WHERE timestamp BETWEEN p_start_date AND p_end_date
        AND (p_user_id IS NULL OR user_id = p_user_id)
      GROUP BY EXTRACT(HOUR FROM timestamp)
      ORDER BY hour
    ) t
  )
  SELECT
    s.total,
    s.credits,
    s.successful,
    s.failed,
    ROUND(s.avg_time::numeric, 2),
    COALESCE(bf.data, '{}'::jsonb),
    COALESCE(bd.data, '{}'::jsonb),
    COALESCE(bi.data, '[]'::jsonb),
    COALESCE(bh.data, '{}'::jsonb)
  FROM stats s
  CROSS JOIN by_function bf
  CROSS JOIN by_day bd
  CROSS JOIN by_ip bi
  CROSS JOIN by_hour bh;
END;
$$;