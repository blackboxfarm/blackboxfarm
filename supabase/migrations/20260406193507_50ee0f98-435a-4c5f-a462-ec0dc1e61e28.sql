
-- Add persistent channel selection to telegram_link_codes
ALTER TABLE public.telegram_link_codes
ADD COLUMN IF NOT EXISTS selected_channel_id bigint;

-- Fix the default admin_config to use 3000ms delay instead of 0
ALTER TABLE public.channel_installations
ALTER COLUMN admin_config SET DEFAULT '{"delay_ms": 3000, "verbose": false, "admin_only_commands": false, "enabled_tiers": [], "dev_wallet_alerts": false}'::jsonb;

-- Backfill all existing installations that have delay_ms = 0 to 3000
UPDATE public.channel_installations
SET admin_config = admin_config || '{"delay_ms": 3000}'::jsonb
WHERE (admin_config->>'delay_ms')::int = 0
   OR admin_config->>'delay_ms' IS NULL;
