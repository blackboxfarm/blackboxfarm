-- Add new columns for multi-function architecture
-- These columns prevent redundant checks and enable efficient staleness detection

-- One-time check flags (prevents re-checking Mayhem Mode and Bundle Score)
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS mayhem_checked boolean DEFAULT false;
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS bundle_checked boolean DEFAULT false;

-- Socials tracking (only check once per hour for qualified tokens)
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS socials_checked_at timestamptz;

-- Staleness detection
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS consecutive_stale_checks integer DEFAULT 0;
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS metrics_hash text;

-- Track which function last processed this token
ALTER TABLE pumpfun_watchlist ADD COLUMN IF NOT EXISTS last_processor text;

-- Add index for efficient querying by status and staleness
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_status_stale 
ON pumpfun_watchlist(status, consecutive_stale_checks);

-- Add index for last_checked_at queries
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_last_checked 
ON pumpfun_watchlist(status, last_checked_at);

-- Update existing rows to have mayhem_checked and bundle_checked = true
-- (since they already passed those checks to get into the watchlist)
UPDATE pumpfun_watchlist 
SET mayhem_checked = true, bundle_checked = true 
WHERE mayhem_checked IS NULL OR bundle_checked IS NULL;