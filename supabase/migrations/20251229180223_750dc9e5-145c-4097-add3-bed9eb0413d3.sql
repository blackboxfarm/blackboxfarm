-- Add is_active column to telegram_fantasy_positions for tracking which positions to monitor
ALTER TABLE telegram_fantasy_positions 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Ensure target_sell_multiplier has a default for existing records
UPDATE telegram_fantasy_positions 
SET target_sell_multiplier = 2.0 
WHERE target_sell_multiplier IS NULL AND status = 'open';

-- Add stop_loss_enabled column if it doesn't exist
ALTER TABLE telegram_fantasy_positions 
ADD COLUMN IF NOT EXISTS stop_loss_enabled BOOLEAN DEFAULT true;

-- Add auto_sell_triggered column to track how the position was closed
ALTER TABLE telegram_fantasy_positions 
ADD COLUMN IF NOT EXISTS auto_sell_triggered BOOLEAN DEFAULT false;

-- Enable realtime for this table
ALTER TABLE telegram_fantasy_positions REPLICA IDENTITY FULL;

-- Add index for faster querying of active positions
CREATE INDEX IF NOT EXISTS idx_fantasy_positions_active_open 
ON telegram_fantasy_positions(is_active, status) 
WHERE is_active = true AND status = 'open';