
-- Morning Reports table to store daily comprehensive reports
CREATE TABLE public.morning_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  report_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  report_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Overall status
  overall_status TEXT NOT NULL DEFAULT 'healthy', -- healthy, warning, critical
  
  -- API Usage Breakdown (per-service stats for the overnight period)
  api_usage_summary JSONB NOT NULL DEFAULT '{}',
  -- { service_name: { total_calls, successful, failed, fail_rate_pct, avg_response_ms, credits_used, top_errors: [] } }
  
  -- Rate Limit & Auth Issues
  rate_limit_events JSONB NOT NULL DEFAULT '[]',
  auth_failure_events JSONB NOT NULL DEFAULT '[]',
  
  -- Quota Status (snapshot at report time)
  quota_status JSONB NOT NULL DEFAULT '{}',
  -- { service_name: { used, limit, pct, status } }
  
  -- Error Patterns (repeated failures grouped)
  error_patterns JSONB NOT NULL DEFAULT '[]',
  
  -- Signups & Subscribers overnight
  new_signups INTEGER NOT NULL DEFAULT 0,
  new_signups_details JSONB NOT NULL DEFAULT '[]',
  new_subscribers INTEGER NOT NULL DEFAULT 0,
  new_subscribers_details JSONB NOT NULL DEFAULT '[]',
  
  -- Table Health (row counts, bloat warnings)
  table_health JSONB NOT NULL DEFAULT '{}',
  
  -- Cloudflare / External Workers (if trackable)
  external_services_status JSONB NOT NULL DEFAULT '{}',
  
  -- Unread Notifications count
  unread_notifications INTEGER NOT NULL DEFAULT 0,
  
  -- Alerts generated
  alerts JSONB NOT NULL DEFAULT '[]',
  
  -- Execution metadata
  execution_time_ms INTEGER,
  telegram_sent BOOLEAN NOT NULL DEFAULT false,
  telegram_sent_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.morning_reports ENABLE ROW LEVEL SECURITY;

-- Only super admins can read
CREATE POLICY "Super admins can read morning reports"
  ON public.morning_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert (edge function)
CREATE POLICY "Service can insert morning reports"
  ON public.morning_reports FOR INSERT
  WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX idx_morning_reports_date ON public.morning_reports(report_date DESC);
