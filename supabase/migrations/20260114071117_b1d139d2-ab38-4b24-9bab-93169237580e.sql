-- Add enrichment columns to pumpfun_blacklist
ALTER TABLE pumpfun_blacklist ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending';
ALTER TABLE pumpfun_blacklist ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
ALTER TABLE pumpfun_blacklist ADD COLUMN IF NOT EXISTS enrichment_error TEXT;
ALTER TABLE pumpfun_blacklist ADD COLUMN IF NOT EXISTS funding_trace JSONB;
ALTER TABLE pumpfun_blacklist ADD COLUMN IF NOT EXISTS auto_discovered_links JSONB;

-- Add index for enrichment status queries
CREATE INDEX IF NOT EXISTS idx_pumpfun_blacklist_enrichment_status ON pumpfun_blacklist(enrichment_status);

-- Comment on columns
COMMENT ON COLUMN pumpfun_blacklist.enrichment_status IS 'Status of auto-enrichment: pending, enriching, complete, failed';
COMMENT ON COLUMN pumpfun_blacklist.enriched_at IS 'When the enrichment was completed';
COMMENT ON COLUMN pumpfun_blacklist.enrichment_error IS 'Error message if enrichment failed';
COMMENT ON COLUMN pumpfun_blacklist.funding_trace IS 'Wallet genealogy tree showing funding sources';
COMMENT ON COLUMN pumpfun_blacklist.auto_discovered_links IS 'Cross-links discovered automatically by enrichment';