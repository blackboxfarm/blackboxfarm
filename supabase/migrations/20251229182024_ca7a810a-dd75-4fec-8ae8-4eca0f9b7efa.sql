-- Add peak tracking columns to telegram_fantasy_positions
ALTER TABLE telegram_fantasy_positions 
ADD COLUMN IF NOT EXISTS peak_price_usd NUMERIC,
ADD COLUMN IF NOT EXISTS peak_price_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS peak_multiplier NUMERIC;

-- Add index for efficient peak queries
CREATE INDEX IF NOT EXISTS idx_telegram_fantasy_positions_peak 
ON telegram_fantasy_positions(peak_multiplier) 
WHERE peak_multiplier IS NOT NULL;