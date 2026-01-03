-- Add lifecycle timestamp columns for tracking token promotion/demotion
ALTER TABLE pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS promoted_to_buy_now_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS demoted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS demotion_reason TEXT;