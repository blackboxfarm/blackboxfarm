-- Add scan_window_minutes column to telegram_channel_config
ALTER TABLE telegram_channel_config 
ADD COLUMN IF NOT EXISTS scan_window_minutes integer DEFAULT 1440;

-- Update @sogjews to have reasonable scan settings
UPDATE telegram_channel_config 
SET scan_window_minutes = 1440,  -- 24 hours of messages
    max_mint_age_minutes = 10080  -- 7 days old tokens ok
WHERE channel_username = 'sogjews';

-- Add comment for clarity
COMMENT ON COLUMN telegram_channel_config.scan_window_minutes IS 'How far back to scan messages in minutes (default 24 hours)';