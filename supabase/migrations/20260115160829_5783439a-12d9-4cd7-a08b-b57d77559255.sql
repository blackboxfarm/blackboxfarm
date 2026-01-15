-- Create table for persistent Helius rate limiting state
CREATE TABLE IF NOT EXISTS public.helius_rate_limit_state (
  id TEXT PRIMARY KEY DEFAULT 'global',
  call_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  circuit_breaker_active BOOLEAN NOT NULL DEFAULT false,
  circuit_breaker_until TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default row if not exists
INSERT INTO public.helius_rate_limit_state (id, call_count, window_start)
VALUES ('global', 0, now())
ON CONFLICT (id) DO NOTHING;

-- Create index for helius_api_usage queries if not exists
CREATE INDEX IF NOT EXISTS idx_helius_api_usage_created_at ON public.helius_api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_helius_api_usage_function_name ON public.helius_api_usage(function_name);

-- Ensure the table exists with proper structure
CREATE TABLE IF NOT EXISTS public.helius_api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  endpoint TEXT,
  method TEXT,
  request_params JSONB,
  response_status INTEGER,
  response_time_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  credits_used INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS policies for rate limit state (service role only)
ALTER TABLE public.helius_rate_limit_state ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access to rate limit state" 
ON public.helius_rate_limit_state
FOR ALL 
USING (true)
WITH CHECK (true);

-- RLS for helius_api_usage (service role can insert, admins can read)
ALTER TABLE public.helius_api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can insert helius usage" 
ON public.helius_api_usage
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service role can read helius usage" 
ON public.helius_api_usage
FOR SELECT 
USING (true);