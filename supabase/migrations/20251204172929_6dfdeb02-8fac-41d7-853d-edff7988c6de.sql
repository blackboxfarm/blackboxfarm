-- Add pending_telegram_ids column for approval workflow
ALTER TABLE public.mega_whale_alert_config 
ADD COLUMN IF NOT EXISTS pending_telegram_ids JSONB DEFAULT '[]'::jsonb;