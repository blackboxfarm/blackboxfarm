-- Add comprehensive token data columns to token_lifecycle
ALTER TABLE token_lifecycle
ADD COLUMN IF NOT EXISTS symbol TEXT,
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS pair_address TEXT,
ADD COLUMN IF NOT EXISTS dex_id TEXT,
ADD COLUMN IF NOT EXISTS liquidity_usd NUMERIC,
ADD COLUMN IF NOT EXISTS volume_24h NUMERIC,
ADD COLUMN IF NOT EXISTS market_cap NUMERIC,
ADD COLUMN IF NOT EXISTS fdv NUMERIC,
ADD COLUMN IF NOT EXISTS price_usd NUMERIC,
ADD COLUMN IF NOT EXISTS pair_created_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS active_boosts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS discovery_source TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_liquidity ON token_lifecycle(liquidity_usd DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_volume ON token_lifecycle(volume_24h DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_pair_created ON token_lifecycle(pair_created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_symbol ON token_lifecycle(symbol);

-- Add liquidity and volume to token_rankings for historical tracking
ALTER TABLE token_rankings
ADD COLUMN IF NOT EXISTS liquidity_usd NUMERIC,
ADD COLUMN IF NOT EXISTS volume_24h NUMERIC,
ADD COLUMN IF NOT EXISTS market_cap NUMERIC;