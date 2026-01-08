-- KingKong Caller Mode: Dual-position trading strategy
-- Adds settings for executing two simultaneous positions per token call:
-- 1. Quick Flip - Small bet with fast target, no moonbag
-- 2. Diamond Hand - Larger bet with trailing stop only, riding for max gains

-- Add KingKong columns to telegram_channel_config
ALTER TABLE telegram_channel_config
ADD COLUMN IF NOT EXISTS kingkong_mode_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS kingkong_quick_amount_usd NUMERIC DEFAULT 25,
ADD COLUMN IF NOT EXISTS kingkong_quick_multiplier NUMERIC DEFAULT 2,
ADD COLUMN IF NOT EXISTS kingkong_diamond_amount_usd NUMERIC DEFAULT 100,
ADD COLUMN IF NOT EXISTS kingkong_diamond_trailing_stop_pct NUMERIC DEFAULT 25,
ADD COLUMN IF NOT EXISTS kingkong_diamond_min_peak_x NUMERIC DEFAULT 5,
ADD COLUMN IF NOT EXISTS kingkong_diamond_max_hold_hours NUMERIC DEFAULT 24;

-- Add Diamond Hand columns to flip_positions
ALTER TABLE flip_positions
ADD COLUMN IF NOT EXISTS position_type TEXT DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS is_diamond_hand BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS diamond_peak_multiplier NUMERIC,
ADD COLUMN IF NOT EXISTS diamond_trailing_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS diamond_trailing_stop_pct NUMERIC DEFAULT 25,
ADD COLUMN IF NOT EXISTS diamond_min_peak_x NUMERIC DEFAULT 5,
ADD COLUMN IF NOT EXISTS diamond_max_hold_hours NUMERIC DEFAULT 24,
ADD COLUMN IF NOT EXISTS paired_position_id UUID REFERENCES flip_positions(id);

-- Add index for position type queries
CREATE INDEX IF NOT EXISTS idx_flip_positions_position_type ON flip_positions(position_type);
CREATE INDEX IF NOT EXISTS idx_flip_positions_diamond_hand ON flip_positions(is_diamond_hand) WHERE is_diamond_hand = true;

-- Comment for clarity
COMMENT ON COLUMN telegram_channel_config.kingkong_mode_enabled IS 'Enables dual-position mode: Quick Flip + Diamond Hand';
COMMENT ON COLUMN flip_positions.position_type IS 'Position strategy type: standard, quick_flip, diamond_hand';
COMMENT ON COLUMN flip_positions.diamond_trailing_active IS 'True when diamond hand has hit min_peak_x and trailing stop is active';
COMMENT ON COLUMN flip_positions.paired_position_id IS 'Links quick_flip and diamond_hand positions created from same call';