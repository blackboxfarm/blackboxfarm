-- Add enrichment tracking columns to scraped_tokens
ALTER TABLE scraped_tokens 
ADD COLUMN IF NOT EXISTS image_url text,
ADD COLUMN IF NOT EXISTS raydium_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS metadata_fetched_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS creator_fetched_at timestamp with time zone;

-- Create index for faster lookups on tokens needing enrichment
CREATE INDEX IF NOT EXISTS idx_scraped_tokens_needs_enrichment 
ON scraped_tokens(metadata_fetched_at, creator_fetched_at) 
WHERE metadata_fetched_at IS NULL OR creator_fetched_at IS NULL;