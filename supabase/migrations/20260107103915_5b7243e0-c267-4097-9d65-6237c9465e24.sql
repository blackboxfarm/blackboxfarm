-- Add columns to pumpfun_seen_symbols for smart duplicate detection
ALTER TABLE pumpfun_seen_symbols 
ADD COLUMN IF NOT EXISTS creator_wallet TEXT,
ADD COLUMN IF NOT EXISTS peak_mcap_usd NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS lifespan_mins INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_test_launch BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS token_outcome TEXT DEFAULT 'unknown';

-- Add index for faster creator_wallet lookups
CREATE INDEX IF NOT EXISTS idx_pumpfun_seen_symbols_creator_wallet 
ON pumpfun_seen_symbols(creator_wallet);

-- Add index for symbol + creator combo lookups (same-dev duplicate check)
CREATE INDEX IF NOT EXISTS idx_pumpfun_seen_symbols_symbol_creator 
ON pumpfun_seen_symbols(symbol_lower, creator_wallet);

-- Add columns to dev_wallet_reputation for pattern detection
ALTER TABLE dev_wallet_reputation
ADD COLUMN IF NOT EXISTS dev_pattern TEXT DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS total_same_name_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_token_lifespan_mins INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS success_rate_pct NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_serial_spammer BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_test_launcher BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_legitimate_builder BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN pumpfun_seen_symbols.creator_wallet IS 'Wallet that created this token, for same-dev duplicate detection';
COMMENT ON COLUMN pumpfun_seen_symbols.peak_mcap_usd IS 'Peak market cap achieved, to determine if token was successful';
COMMENT ON COLUMN pumpfun_seen_symbols.lifespan_mins IS 'How long token lasted before dying, for test launch detection';
COMMENT ON COLUMN pumpfun_seen_symbols.is_test_launch IS 'True if this appears to be a test launch (died quickly, low mcap)';
COMMENT ON COLUMN pumpfun_seen_symbols.token_outcome IS 'Outcome: unknown, test, failed, successful, graduated';

COMMENT ON COLUMN dev_wallet_reputation.dev_pattern IS 'Detected pattern: unknown, serial_spammer, fee_farmer, test_launcher, legitimate_builder';
COMMENT ON COLUMN dev_wallet_reputation.is_serial_spammer IS 'True if dev has 100+ tokens with <1% success rate';
COMMENT ON COLUMN dev_wallet_reputation.is_test_launcher IS 'True if dev shows test-before-real-launch pattern';
COMMENT ON COLUMN dev_wallet_reputation.is_legitimate_builder IS 'True if dev has few tokens with high success rate';