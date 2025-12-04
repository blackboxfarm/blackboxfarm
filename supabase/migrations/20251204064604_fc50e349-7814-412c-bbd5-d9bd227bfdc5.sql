-- Add helius_webhook_id column to whale_frenzy_config
ALTER TABLE public.whale_frenzy_config 
ADD COLUMN IF NOT EXISTS helius_webhook_id text;

-- Add monitoring_active column to track webhook status
ALTER TABLE public.whale_frenzy_config 
ADD COLUMN IF NOT EXISTS monitoring_active boolean DEFAULT false;