-- Add new columns to morning_reports for Phase 2 data
ALTER TABLE public.morning_reports
ADD COLUMN IF NOT EXISTS function_health jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS dlq_stats jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS spider_metrics jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS mesh_growth jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS funnel_metrics jsonb DEFAULT '{}'::jsonb;

-- Also add to the archive table
ALTER TABLE public.morning_reports_archive
ADD COLUMN IF NOT EXISTS function_health jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS dlq_stats jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS spider_metrics jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS mesh_growth jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS funnel_metrics jsonb DEFAULT '{}'::jsonb;

-- Add unique constraints only if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'error_trend_snapshot_date_svc_ep') THEN
    ALTER TABLE public.error_trend_snapshot ADD CONSTRAINT error_trend_snapshot_date_svc_ep UNIQUE (snapshot_date, service_name, endpoint);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mesh_growth_daily_date_key') THEN
    ALTER TABLE public.mesh_growth_daily ADD CONSTRAINT mesh_growth_daily_date_key UNIQUE (snapshot_date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'token_funnel_daily_date_stage_key') THEN
    ALTER TABLE public.token_funnel_daily ADD CONSTRAINT token_funnel_daily_date_stage_key UNIQUE (funnel_date, stage);
  END IF;
END $$;