-- Add holder count filter settings to channel config
ALTER TABLE telegram_channel_config 
ADD COLUMN IF NOT EXISTS min_holder_count INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS holder_check_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS holder_check_action TEXT DEFAULT 'skip';

COMMENT ON COLUMN telegram_channel_config.min_holder_count IS 'Minimum holder count required for fantasy buy';
COMMENT ON COLUMN telegram_channel_config.holder_check_enabled IS 'Whether to check holder count before fantasy buy';
COMMENT ON COLUMN telegram_channel_config.holder_check_action IS 'Action when holder count is below minimum: skip, watchlist, warn_only';

-- Add holder count at entry to positions
ALTER TABLE telegram_fantasy_positions
ADD COLUMN IF NOT EXISTS holder_count_at_entry INTEGER;

COMMENT ON COLUMN telegram_fantasy_positions.holder_count_at_entry IS 'Number of token holders at time of fantasy entry';