-- Add trail tracking columns for post-sale monitoring
ALTER TABLE telegram_fantasy_positions 
ADD COLUMN IF NOT EXISTS trail_tracking_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS trail_current_price_usd numeric,
ADD COLUMN IF NOT EXISTS trail_peak_price_usd numeric,
ADD COLUMN IF NOT EXISTS trail_peak_multiplier numeric,
ADD COLUMN IF NOT EXISTS trail_peak_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS trail_low_price_usd numeric,
ADD COLUMN IF NOT EXISTS trail_low_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS trail_last_updated_at timestamp with time zone;

-- Add comment to explain the trail columns
COMMENT ON COLUMN telegram_fantasy_positions.trail_tracking_enabled IS 'Continue tracking price after sell to see the trail';
COMMENT ON COLUMN telegram_fantasy_positions.trail_current_price_usd IS 'Current price after position was sold';
COMMENT ON COLUMN telegram_fantasy_positions.trail_peak_price_usd IS 'Highest price reached after position was sold';
COMMENT ON COLUMN telegram_fantasy_positions.trail_peak_multiplier IS 'Peak price vs sold price multiplier';
COMMENT ON COLUMN telegram_fantasy_positions.trail_low_price_usd IS 'Lowest price reached after position was sold';
COMMENT ON COLUMN telegram_fantasy_positions.trail_low_at IS 'When the lowest post-sale price was recorded';