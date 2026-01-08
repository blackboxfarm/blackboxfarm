
-- Add polling interval column to telegram_channel_config
-- NULL means use default polling, otherwise use the specified interval in seconds
ALTER TABLE telegram_channel_config 
ADD COLUMN IF NOT EXISTS polling_interval_seconds INTEGER DEFAULT NULL;

-- Add a comment to explain the column
COMMENT ON COLUMN telegram_channel_config.polling_interval_seconds IS 'Custom polling interval in seconds. NULL = use system default. Lower values = more frequent polling for high-volume channels.';
