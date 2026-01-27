-- Create holders_intel_surge_alerts table for tracking search surges
CREATE TABLE public.holders_intel_surge_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  alert_type TEXT NOT NULL, -- 'surge_10min', 'spike_1hr', 'trending_24hr'
  search_count INTEGER NOT NULL,
  time_window_minutes INTEGER NOT NULL,
  unique_ips INTEGER,
  detected_at TIMESTAMPTZ DEFAULT now(),
  alert_date DATE DEFAULT CURRENT_DATE, -- Explicit date column for deduplication
  queue_id UUID REFERENCES public.holders_intel_post_queue(id),
  posted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique index for one alert per type per token per day
CREATE UNIQUE INDEX idx_surge_alerts_token_type_day 
ON public.holders_intel_surge_alerts(token_mint, alert_type, alert_date);

-- Index for querying recent alerts
CREATE INDEX idx_surge_alerts_detected_at ON public.holders_intel_surge_alerts(detected_at DESC);

-- Enable RLS
ALTER TABLE public.holders_intel_surge_alerts ENABLE ROW LEVEL SECURITY;

-- Allow super admins to read all alerts
CREATE POLICY "Super admins can read surge alerts"
ON public.holders_intel_surge_alerts
FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- Allow service role full access for edge functions
CREATE POLICY "Service role full access to surge alerts"
ON public.holders_intel_surge_alerts
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');