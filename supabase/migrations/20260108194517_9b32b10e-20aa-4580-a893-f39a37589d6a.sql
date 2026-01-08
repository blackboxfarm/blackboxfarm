-- Add trigger source option for KingKong Caller mode
-- This determines whether the kingkong caller triggers based on whale_name (AI detected) or message username

ALTER TABLE public.telegram_channel_config
ADD COLUMN IF NOT EXISTS kingkong_trigger_source TEXT DEFAULT 'whale_name';

-- Add comment explaining the field
COMMENT ON COLUMN public.telegram_channel_config.kingkong_trigger_source IS 'Determines what triggers KingKong Caller: whale_name (AI detected whale nicknames) or username (message sender username)';