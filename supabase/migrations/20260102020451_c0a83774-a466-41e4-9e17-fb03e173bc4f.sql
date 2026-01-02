-- Add start price column to track initial price when entering watching status
ALTER TABLE pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS price_start_usd numeric;