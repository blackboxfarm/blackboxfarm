-- Enable pg_cron + pg_net for in-app cron control
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Optional admin Telegram ID for the setup wizard self-test DM
ALTER TABLE public.profile_subscription_configs
  ADD COLUMN IF NOT EXISTS admin_telegram_id BIGINT;