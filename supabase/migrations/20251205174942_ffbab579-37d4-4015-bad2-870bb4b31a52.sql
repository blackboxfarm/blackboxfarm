-- Add columns needed for master sync
ALTER TABLE mega_whale_offspring 
ADD COLUMN IF NOT EXISTS is_bundled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bundle_id TEXT,
ADD COLUMN IF NOT EXISTS is_mintable BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS parent_wallet_address TEXT;

-- Add last_sync_at to mega_whales for incremental sync tracking
ALTER TABLE mega_whales
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_offspring_is_dust ON mega_whale_offspring(is_dust) WHERE is_dust = true;
CREATE INDEX IF NOT EXISTS idx_offspring_is_bundled ON mega_whale_offspring(is_bundled) WHERE is_bundled = true;
CREATE INDEX IF NOT EXISTS idx_offspring_is_mintable ON mega_whale_offspring(is_mintable) WHERE is_mintable = true;
CREATE INDEX IF NOT EXISTS idx_offspring_has_minted ON mega_whale_offspring(has_minted) WHERE has_minted = true;