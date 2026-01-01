-- Add source tracking columns to pumpfun_watchlist
ALTER TABLE pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'api',
ADD COLUMN IF NOT EXISTS created_at_blockchain TIMESTAMPTZ;

-- Add comment for clarity
COMMENT ON COLUMN pumpfun_watchlist.source IS 'Token discovery source: websocket, api, manual';
COMMENT ON COLUMN pumpfun_watchlist.created_at_blockchain IS 'Actual token creation time on blockchain';