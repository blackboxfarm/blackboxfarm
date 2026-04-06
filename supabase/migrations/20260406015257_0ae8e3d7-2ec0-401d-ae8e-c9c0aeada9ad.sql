ALTER TABLE public.morning_reports 
  ADD COLUMN IF NOT EXISTS email_verification_stats jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS telegram_bot_stats jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS user_auth_stats jsonb DEFAULT '{}'::jsonb;