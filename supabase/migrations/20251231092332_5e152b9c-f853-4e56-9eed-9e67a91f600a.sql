-- Add test mode to telegram_channel_config
ALTER TABLE telegram_channel_config 
ADD COLUMN IF NOT EXISTS scalp_test_mode boolean DEFAULT true;

-- Add test position flag to flip_positions
ALTER TABLE flip_positions 
ADD COLUMN IF NOT EXISTS is_test_position boolean DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN telegram_channel_config.scalp_test_mode IS 'When enabled, scalp trades are simulated without real transactions';
COMMENT ON COLUMN flip_positions.is_test_position IS 'When true, this position was created in test mode with no real transactions';