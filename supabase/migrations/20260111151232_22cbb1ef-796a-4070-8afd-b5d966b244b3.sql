-- Add bump bot detection and stagnation tracking columns to pumpfun_watchlist
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS micro_tx_count INTEGER DEFAULT 0;
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS micro_tx_ratio FLOAT DEFAULT 0;
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS bump_bot_detected BOOLEAN DEFAULT FALSE;
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS is_stagnant BOOLEAN DEFAULT FALSE;
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS stagnant_reason TEXT;

-- Add index for stagnation queries
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_stagnation ON pumpfun_watchlist (status, is_stagnant, created_at) WHERE status IN ('watching', 'pending_triage');