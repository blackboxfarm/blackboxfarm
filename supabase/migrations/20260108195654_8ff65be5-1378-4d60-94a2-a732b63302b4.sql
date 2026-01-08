-- Add diamond hand stop loss urgency setting
ALTER TABLE public.telegram_channel_config
ADD COLUMN IF NOT EXISTS kingkong_diamond_stop_urgency TEXT DEFAULT 'normal';

COMMENT ON COLUMN public.telegram_channel_config.kingkong_diamond_stop_urgency IS 'Stop loss urgency: normal, aggressive (high gas + slippage), max (max priority)';
