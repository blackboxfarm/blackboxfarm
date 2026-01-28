-- Add quality filtering and deduplication columns to twitter_token_mentions
ALTER TABLE twitter_token_mentions ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE twitter_token_mentions ADD COLUMN IF NOT EXISTS verified_type TEXT;
ALTER TABLE twitter_token_mentions ADD COLUMN IF NOT EXISTS impression_count INT DEFAULT 0;
ALTER TABLE twitter_token_mentions ADD COLUMN IF NOT EXISTS quality_score INT DEFAULT 0;
ALTER TABLE twitter_token_mentions ADD COLUMN IF NOT EXISTS is_best_source BOOLEAN DEFAULT NULL;
ALTER TABLE twitter_token_mentions ADD COLUMN IF NOT EXISTS duplicate_of TEXT;

-- Add index for quality score ranking
CREATE INDEX IF NOT EXISTS idx_twitter_mentions_quality ON twitter_token_mentions(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_twitter_mentions_best_source ON twitter_token_mentions(is_best_source) WHERE is_best_source = true;