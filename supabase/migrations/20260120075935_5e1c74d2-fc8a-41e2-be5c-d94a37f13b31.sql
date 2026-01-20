-- Add stale alpha protection columns to telegram_channel_calls
ALTER TABLE telegram_channel_calls 
ADD COLUMN IF NOT EXISTS message_timestamp timestamptz,
ADD COLUMN IF NOT EXISTS price_at_message_time numeric,
ADD COLUMN IF NOT EXISTS price_drop_pct numeric,
ADD COLUMN IF NOT EXISTS sanity_check_passed boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS price_source_at_message text;

-- Add stale alpha protection config to telegram_channel_config
ALTER TABLE telegram_channel_config
ADD COLUMN IF NOT EXISTS stale_alpha_check_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS stale_alpha_drop_threshold numeric DEFAULT 40,
ADD COLUMN IF NOT EXISTS stale_alpha_min_age_seconds integer DEFAULT 30;

-- Add index for faster lookups of blocked calls
CREATE INDEX IF NOT EXISTS idx_telegram_channel_calls_sanity_check 
ON telegram_channel_calls(sanity_check_passed) 
WHERE sanity_check_passed = false;

-- Comment for documentation
COMMENT ON COLUMN telegram_channel_calls.message_timestamp IS 'Telegram message post timestamp (from msg.date)';
COMMENT ON COLUMN telegram_channel_calls.price_at_message_time IS 'Historical token price at exact message timestamp';
COMMENT ON COLUMN telegram_channel_calls.price_drop_pct IS 'Percentage price drop from message time to scan time (positive = drop)';
COMMENT ON COLUMN telegram_channel_calls.sanity_check_passed IS 'Whether the stale alpha sanity check passed';
COMMENT ON COLUMN telegram_channel_config.stale_alpha_drop_threshold IS 'Block buy if price dropped more than this % since call (default 40%)';