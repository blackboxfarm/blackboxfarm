ALTER TABLE public.morning_reports
  ADD COLUMN IF NOT EXISTS web_chat_stats jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sol_subscription_stats jsonb DEFAULT NULL;

ALTER TABLE public.morning_reports_archive
  ADD COLUMN IF NOT EXISTS web_chat_stats jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sol_subscription_stats jsonb DEFAULT NULL;