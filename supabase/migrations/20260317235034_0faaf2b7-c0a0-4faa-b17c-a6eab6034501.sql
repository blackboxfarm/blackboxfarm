-- ============================================================
-- CATEGORY A: Error Logs and Reports
-- ============================================================

-- A1: Edge Function Execution Log (ASAP priority)
CREATE TABLE IF NOT EXISTS public.edge_function_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  invocation_source text DEFAULT 'unknown',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  status text NOT NULL DEFAULT 'running',
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_efr_function_name ON public.edge_function_runs (function_name);
CREATE INDEX idx_efr_started_at ON public.edge_function_runs (started_at DESC);
CREATE INDEX idx_efr_status ON public.edge_function_runs (status);
CREATE INDEX idx_efr_function_status ON public.edge_function_runs (function_name, status, started_at DESC);

ALTER TABLE public.edge_function_runs ENABLE ROW LEVEL SECURITY;

-- A2: Dead Letter Queue
CREATE TABLE IF NOT EXISTS public.dead_letter_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_function text NOT NULL,
  operation text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  next_retry_at timestamptz DEFAULT now() + interval '5 minutes',
  resolved_at timestamptz,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_dlq_status_retry ON public.dead_letter_queue (status, next_retry_at) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_dlq_source ON public.dead_letter_queue (source_function);

ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;

-- A3: Error Trend Snapshot
CREATE TABLE IF NOT EXISTS public.error_trend_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  service_name text NOT NULL,
  endpoint text,
  error_count integer DEFAULT 0,
  status_401_count integer DEFAULT 0,
  status_403_count integer DEFAULT 0,
  status_429_count integer DEFAULT 0,
  status_500_count integer DEFAULT 0,
  avg_7d_error_count numeric,
  is_anomaly boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(snapshot_date, service_name, endpoint)
);

CREATE INDEX idx_ets_date ON public.error_trend_snapshot (snapshot_date DESC);

ALTER TABLE public.error_trend_snapshot ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CATEGORY B: Communication and Alerts
-- ============================================================

-- B1: Notification Delivery Log
CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid,
  channel text NOT NULL,
  recipient text,
  status text NOT NULL DEFAULT 'pending',
  response_code integer,
  response_body text,
  error_message text,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ndl_channel_status ON public.notification_delivery_log (channel, status);
CREATE INDEX idx_ndl_created ON public.notification_delivery_log (created_at DESC);

ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;

-- B3: Service Status
CREATE TABLE IF NOT EXISTS public.service_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'operational',
  last_checked_at timestamptz DEFAULT now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  message text,
  metadata jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.service_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read service status" ON public.service_status
  FOR SELECT USING (true);

-- ============================================================
-- CATEGORY C: API Usage, Sources, Rotation, Costs
-- ============================================================

-- C1: Monthly Usage Archive
CREATE TABLE IF NOT EXISTS public.monthly_usage_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  month_year text NOT NULL,
  total_calls integer DEFAULT 0,
  total_credits_used numeric DEFAULT 0,
  total_errors integer DEFAULT 0,
  quota_limit integer,
  usage_percentage numeric,
  estimated_cost_usd numeric,
  archived_at timestamptz DEFAULT now(),
  UNIQUE(service_name, month_year)
);

ALTER TABLE public.monthly_usage_archive ENABLE ROW LEVEL SECURITY;

-- C2: Add cost_per_credit_usd to api_service_config
ALTER TABLE public.api_service_config
  ADD COLUMN IF NOT EXISTS cost_per_credit_usd numeric DEFAULT 0;

-- ============================================================
-- CATEGORY D: Spidering and Scaling Metrics
-- ============================================================

-- D1: Spider Run Metrics
CREATE TABLE IF NOT EXISTS public.spider_run_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL DEFAULT CURRENT_DATE,
  tokens_spidered integer DEFAULT 0,
  wallets_discovered integer DEFAULT 0,
  mesh_links_added integer DEFAULT 0,
  social_identities_found integer DEFAULT 0,
  blacklist_hits integer DEFAULT 0,
  whitelist_hits integer DEFAULT 0,
  avg_genealogy_depth numeric DEFAULT 0,
  avg_run_time_ms integer DEFAULT 0,
  errors integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_srm_date ON public.spider_run_metrics (run_date DESC);

ALTER TABLE public.spider_run_metrics ENABLE ROW LEVEL SECURITY;

-- D2: Token Funnel Daily
CREATE TABLE IF NOT EXISTS public.token_funnel_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_date date NOT NULL DEFAULT CURRENT_DATE,
  stage text NOT NULL,
  token_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(funnel_date, stage)
);

CREATE INDEX idx_tfd_date ON public.token_funnel_daily (funnel_date DESC);

ALTER TABLE public.token_funnel_daily ENABLE ROW LEVEL SECURITY;

-- D3: Mesh Growth Daily
CREATE TABLE IF NOT EXISTS public.mesh_growth_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL UNIQUE DEFAULT CURRENT_DATE,
  total_wallet_links integer DEFAULT 0,
  total_social_identities integer DEFAULT 0,
  total_developer_profiles integer DEFAULT 0,
  new_links_24h integer DEFAULT 0,
  new_identities_24h integer DEFAULT 0,
  new_profiles_24h integer DEFAULT 0,
  coverage_pct numeric DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.mesh_growth_daily ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Cleanup functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_edge_function_runs(retention_days integer DEFAULT 14)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.edge_function_runs
  WHERE started_at < now() - (retention_days || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_dead_letter_queue(retention_days integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.dead_letter_queue
  WHERE status IN ('resolved', 'exhausted')
    AND updated_at < now() - (retention_days || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;