-- Add creator_wallet to flip_positions for cross-referencing
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS creator_wallet TEXT;

-- Add indexes for faster blacklist/whitelist lookups
CREATE INDEX IF NOT EXISTS idx_blacklist_identifier ON pumpfun_blacklist(identifier);
CREATE INDEX IF NOT EXISTS idx_blacklist_entry_type ON pumpfun_blacklist(entry_type);
CREATE INDEX IF NOT EXISTS idx_whitelist_identifier ON pumpfun_whitelist(identifier);
CREATE INDEX IF NOT EXISTS idx_whitelist_entry_type ON pumpfun_whitelist(entry_type);
CREATE INDEX IF NOT EXISTS idx_neutrallist_identifier ON pumpfun_neutrallist(identifier);
CREATE INDEX IF NOT EXISTS idx_flip_positions_creator_wallet ON flip_positions(creator_wallet);