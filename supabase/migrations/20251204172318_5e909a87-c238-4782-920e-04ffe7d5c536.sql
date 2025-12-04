-- Add additional_telegram_ids column to mega_whale_alert_config
ALTER TABLE public.mega_whale_alert_config 
ADD COLUMN IF NOT EXISTS additional_telegram_ids TEXT[] DEFAULT '{}';