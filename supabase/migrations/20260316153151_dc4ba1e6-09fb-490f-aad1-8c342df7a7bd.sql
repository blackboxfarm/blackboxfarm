-- Create archived morning reports table
CREATE TABLE public.morning_reports_archive (
  id uuid PRIMARY KEY,
  report_date date NOT NULL,
  report_period_start timestamptz,
  report_period_end timestamptz,
  overall_status text,
  api_usage_summary jsonb,
  rate_limit_events jsonb,
  auth_failure_events jsonb,
  quota_status jsonb,
  error_patterns jsonb,
  new_signups integer DEFAULT 0,
  new_signups_details jsonb,
  new_subscribers integer DEFAULT 0,
  new_subscribers_details jsonb,
  table_health jsonb,
  external_services_status jsonb,
  holders_intel_metrics jsonb,
  unread_notifications integer DEFAULT 0,
  alerts jsonb,
  execution_time_ms integer,
  telegram_sent boolean DEFAULT false,
  telegram_sent_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz
);

ALTER TABLE public.morning_reports_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view archived reports"
  ON public.morning_reports_archive FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Create index for efficient date lookups
CREATE INDEX idx_morning_reports_archive_date ON public.morning_reports_archive (report_date DESC);

-- Function to archive old reports (keeps last 30 days active)
CREATE OR REPLACE FUNCTION public.archive_old_morning_reports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  archived_count integer;
BEGIN
  -- Move reports older than 30 days to archive
  WITH moved AS (
    INSERT INTO morning_reports_archive (
      id, report_date, report_period_start, report_period_end, overall_status,
      api_usage_summary, rate_limit_events, auth_failure_events, quota_status,
      error_patterns, new_signups, new_signups_details, new_subscribers,
      new_subscribers_details, table_health, external_services_status,
      holders_intel_metrics, unread_notifications, alerts, execution_time_ms,
      telegram_sent, telegram_sent_at, created_at
    )
    SELECT 
      id, report_date, report_period_start, report_period_end, overall_status,
      api_usage_summary, rate_limit_events, auth_failure_events, quota_status,
      error_patterns, new_signups, new_signups_details, new_subscribers,
      new_subscribers_details, table_health, external_services_status,
      holders_intel_metrics, unread_notifications, alerts, execution_time_ms,
      telegram_sent, telegram_sent_at, created_at
    FROM morning_reports
    WHERE report_date < CURRENT_DATE - INTERVAL '30 days'
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO archived_count FROM moved;

  -- Delete archived reports from active table
  DELETE FROM morning_reports
  WHERE report_date < CURRENT_DATE - INTERVAL '30 days';

  RETURN archived_count;
END;
$$;