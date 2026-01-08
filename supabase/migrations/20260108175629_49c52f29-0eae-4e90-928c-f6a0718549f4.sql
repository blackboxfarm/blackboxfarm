-- Add exclude_from_stats columns to telegram_fantasy_positions
ALTER TABLE telegram_fantasy_positions
ADD COLUMN IF NOT EXISTS exclude_from_stats BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS exclusion_reason TEXT;

COMMENT ON COLUMN telegram_fantasy_positions.exclude_from_stats IS 
  'If true, position is excluded from win rate and PnL statistics';
COMMENT ON COLUMN telegram_fantasy_positions.exclusion_reason IS 
  'Reason for exclusion (e.g., pre-monitoring, test data, manual override)';

-- Backfill: Mark pre-monitoring positions that missed their targets
-- These are open positions from INSIDER WALLET TRACKING created before ~10:00 AM
-- that have high ATH multipliers but are now in loss
UPDATE telegram_fantasy_positions
SET 
  exclude_from_stats = true,
  exclusion_reason = 'Pre-monitoring: Price monitor not active when ATH occurred'
WHERE channel_name = 'INSIDER WALLET TRACKING'
  AND status = 'open'
  AND created_at < '2026-01-08 10:00:00+00'
  AND ath_multiplier > 2.0
  AND current_price_usd < entry_price_usd;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_fantasy_positions_exclude_from_stats 
ON telegram_fantasy_positions(exclude_from_stats) WHERE exclude_from_stats = true;