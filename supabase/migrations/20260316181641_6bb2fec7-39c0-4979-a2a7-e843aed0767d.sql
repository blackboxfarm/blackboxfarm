
-- Add vigil and allstar tracking columns to morning_reports
ALTER TABLE public.morning_reports 
  ADD COLUMN IF NOT EXISTS vigil_stats jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS allstar_stats jsonb DEFAULT '{}'::jsonb;
