-- API Service Configuration table for tracking quotas, billing, and rotation
CREATE TABLE public.api_service_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Rate Limits
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER,
  rate_limit_per_day INTEGER,
  
  -- Monthly Quotas & Billing
  monthly_quota INTEGER,
  monthly_quota_used INTEGER DEFAULT 0,
  billing_cycle_start DATE,
  cost_per_unit DECIMAL(10, 6) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  monthly_cost_cap DECIMAL(10, 2),
  
  -- API Key Management
  api_key_rotation_date DATE,
  api_key_last_rotated DATE,
  api_key_rotation_reminder_days INTEGER DEFAULT 7,
  
  -- Alert Thresholds (percentages)
  alert_threshold_warning INTEGER DEFAULT 80,
  alert_threshold_critical INTEGER DEFAULT 90,
  alert_threshold_exceeded INTEGER DEFAULT 100,
  
  -- Status
  is_enabled BOOLEAN DEFAULT true,
  is_paid_service BOOLEAN DEFAULT false,
  tier TEXT DEFAULT 'free',
  
  -- Tracking
  last_request_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  error_count_today INTEGER DEFAULT 0,
  success_count_today INTEGER DEFAULT 0,
  
  -- Metadata
  documentation_url TEXT,
  dashboard_url TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_service_config ENABLE ROW LEVEL SECURITY;

-- Only super admins can view/modify
CREATE POLICY "Super admins can manage api_service_config"
ON public.api_service_config
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Create indexes
CREATE INDEX idx_api_service_config_name ON public.api_service_config(service_name);
CREATE INDEX idx_api_service_config_rotation ON public.api_service_config(api_key_rotation_date) WHERE api_key_rotation_date IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER update_api_service_config_updated_at
  BEFORE UPDATE ON public.api_service_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default service configurations
INSERT INTO public.api_service_config (service_name, display_name, description, rate_limit_per_minute, monthly_quota, is_paid_service, tier, cost_per_unit, documentation_url) VALUES
  ('helius', 'Helius', 'Premium RPC + Enhanced APIs (transaction history, token metadata)', 50, 1000000, true, 'developer', 0.0001, 'https://docs.helius.dev'),
  ('solscan', 'Solscan', 'Transaction history and token data API', 100, NULL, true, 'pro', 0.00001, 'https://docs.solscan.io'),
  ('dexscreener', 'DexScreener', 'DEX pair data and price feeds', 300, NULL, false, 'free', 0, 'https://docs.dexscreener.com'),
  ('rugcheck', 'Rugcheck', 'Token safety analysis API', 60, NULL, false, 'free', 0, 'https://rugcheck.xyz'),
  ('pumpfun', 'Pump.fun', 'Bonding curve token data', 120, NULL, false, 'free', 0, 'https://pump.fun'),
  ('jupiter', 'Jupiter', 'DEX aggregator quotes and swaps', 600, NULL, false, 'free', 0, 'https://docs.jup.ag'),
  ('coingecko', 'CoinGecko', 'Market data and price feeds', 50, 10000, false, 'free', 0, 'https://docs.coingecko.com'),
  ('bonkfun', 'Bonk.fun', 'Bonk ecosystem token data', 60, NULL, false, 'free', 0, NULL),
  ('bagsfm', 'Bags.fm', 'Alternative launchpad API', 60, NULL, false, 'free', 0, NULL),
  ('firecrawl', 'Firecrawl', 'Web scraping and data extraction', 20, 500, true, 'starter', 0.001, 'https://docs.firecrawl.dev'),
  ('apify', 'Apify', 'Web scraping actors and automation', 10, 1000, true, 'starter', 0.005, 'https://docs.apify.com');

-- Function to check if service is approaching limits
CREATE OR REPLACE FUNCTION public.check_api_service_alerts()
RETURNS TABLE (
  service_name TEXT,
  display_name TEXT,
  alert_type TEXT,
  current_usage INTEGER,
  limit_value INTEGER,
  usage_percentage DECIMAL,
  days_until_rotation INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cfg.service_name,
    cfg.display_name,
    CASE 
      WHEN cfg.monthly_quota IS NOT NULL AND cfg.monthly_quota_used >= cfg.monthly_quota THEN 'quota_exceeded'
      WHEN cfg.monthly_quota IS NOT NULL AND (cfg.monthly_quota_used::DECIMAL / cfg.monthly_quota * 100) >= cfg.alert_threshold_critical THEN 'quota_critical'
      WHEN cfg.monthly_quota IS NOT NULL AND (cfg.monthly_quota_used::DECIMAL / cfg.monthly_quota * 100) >= cfg.alert_threshold_warning THEN 'quota_warning'
      WHEN cfg.api_key_rotation_date IS NOT NULL AND cfg.api_key_rotation_date <= CURRENT_DATE THEN 'rotation_overdue'
      WHEN cfg.api_key_rotation_date IS NOT NULL AND cfg.api_key_rotation_date <= CURRENT_DATE + cfg.api_key_rotation_reminder_days THEN 'rotation_upcoming'
      ELSE NULL
    END as alert_type,
    cfg.monthly_quota_used as current_usage,
    cfg.monthly_quota as limit_value,
    CASE 
      WHEN cfg.monthly_quota IS NOT NULL AND cfg.monthly_quota > 0 
      THEN ROUND((cfg.monthly_quota_used::DECIMAL / cfg.monthly_quota * 100), 2)
      ELSE 0
    END as usage_percentage,
    CASE 
      WHEN cfg.api_key_rotation_date IS NOT NULL 
      THEN (cfg.api_key_rotation_date - CURRENT_DATE)::INTEGER
      ELSE NULL
    END as days_until_rotation
  FROM public.api_service_config cfg
  WHERE cfg.is_enabled = true
    AND (
      (cfg.monthly_quota IS NOT NULL AND (cfg.monthly_quota_used::DECIMAL / cfg.monthly_quota * 100) >= cfg.alert_threshold_warning)
      OR
      (cfg.api_key_rotation_date IS NOT NULL AND cfg.api_key_rotation_date <= CURRENT_DATE + cfg.api_key_rotation_reminder_days)
    )
  ORDER BY 
    CASE 
      WHEN cfg.monthly_quota IS NOT NULL AND cfg.monthly_quota_used >= cfg.monthly_quota THEN 1
      WHEN cfg.api_key_rotation_date IS NOT NULL AND cfg.api_key_rotation_date <= CURRENT_DATE THEN 2
      ELSE 3
    END,
    usage_percentage DESC NULLS LAST;
END;
$$;

-- Function to get usage stats aggregated from api_usage_log
CREATE OR REPLACE FUNCTION public.get_service_usage_today(p_service_name TEXT)
RETURNS TABLE (
  total_calls BIGINT,
  successful_calls BIGINT,
  failed_calls BIGINT,
  total_credits NUMERIC,
  avg_response_time NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_calls,
    COUNT(*) FILTER (WHERE aul.success = true)::BIGINT as successful_calls,
    COUNT(*) FILTER (WHERE aul.success = false)::BIGINT as failed_calls,
    COALESCE(SUM(aul.credits_used), 0)::NUMERIC as total_credits,
    COALESCE(AVG(aul.response_time_ms), 0)::NUMERIC as avg_response_time
  FROM public.api_usage_log aul
  WHERE aul.service_name = p_service_name
    AND aul.timestamp >= CURRENT_DATE;
END;
$$;

-- Function to update monthly usage from logs  
CREATE OR REPLACE FUNCTION public.sync_api_service_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.api_service_config cfg
  SET 
    monthly_quota_used = COALESCE(usage_data.total_credits, 0),
    success_count_today = COALESCE(usage_data.success_today, 0),
    error_count_today = COALESCE(usage_data.error_today, 0),
    last_request_at = usage_data.last_request,
    updated_at = now()
  FROM (
    SELECT 
      aul.service_name,
      SUM(aul.credits_used)::INTEGER as total_credits,
      COUNT(*) FILTER (WHERE aul.success = true AND aul.timestamp >= CURRENT_DATE)::INTEGER as success_today,
      COUNT(*) FILTER (WHERE aul.success = false AND aul.timestamp >= CURRENT_DATE)::INTEGER as error_today,
      MAX(aul.timestamp) as last_request
    FROM public.api_usage_log aul
    JOIN public.api_service_config c ON c.service_name = aul.service_name
    WHERE aul.timestamp >= COALESCE(c.billing_cycle_start, date_trunc('month', CURRENT_DATE))
    GROUP BY aul.service_name
  ) as usage_data
  WHERE cfg.service_name = usage_data.service_name;
END;
$$;