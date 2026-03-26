ALTER TABLE scraped_tokens ADD COLUMN IF NOT EXISTS community_checked_at timestamptz DEFAULT NULL;
ALTER TABLE holders_intel_seen_tokens ADD COLUMN IF NOT EXISTS community_checked_at timestamptz DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_scraped_tokens_community_unchecked ON scraped_tokens (token_mint) WHERE community_checked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hiseen_community_unchecked ON holders_intel_seen_tokens (token_mint) WHERE community_checked_at IS NULL;