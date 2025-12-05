-- Add configurable price check interval
ALTER TABLE public.mega_whale_auto_buy_config
ADD COLUMN IF NOT EXISTS price_check_interval_seconds integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS max_position_age_hours integer DEFAULT 24;