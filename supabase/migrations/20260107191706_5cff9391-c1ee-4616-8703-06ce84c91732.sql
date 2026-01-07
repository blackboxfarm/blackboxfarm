-- Add persistent_monitoring column to telegram_channel_config
ALTER TABLE public.telegram_channel_config 
ADD COLUMN IF NOT EXISTS persistent_monitoring BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.telegram_channel_config.persistent_monitoring IS 'When true, server-side cron continues price monitoring even when user tab is closed';