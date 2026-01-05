-- Add pattern-tracking columns to dev_wallet_reputation
ALTER TABLE dev_wallet_reputation
ADD COLUMN IF NOT EXISTS tokens_stable_after_dump INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_dump_then_pump_pct NUMERIC,
ADD COLUMN IF NOT EXISTS preferred_dump_window_mins INTEGER;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_dev_wallet_reputation_score ON dev_wallet_reputation(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_dev_wallet_reputation_trust ON dev_wallet_reputation(trust_level);

-- Add columns to token_lifecycle_tracking for better analysis
ALTER TABLE token_lifecycle_tracking
ADD COLUMN IF NOT EXISTS price_at_decision NUMERIC,
ADD COLUMN IF NOT EXISTS price_at_peak NUMERIC,
ADD COLUMN IF NOT EXISTS price_at_death NUMERIC,
ADD COLUMN IF NOT EXISTS missed_gain_pct NUMERIC,
ADD COLUMN IF NOT EXISTS was_missed_opportunity BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS time_to_outcome_mins INTEGER,
ADD COLUMN IF NOT EXISTS social_accounts JSONB DEFAULT '{}';

-- Create index for lifecycle monitoring queries
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_tracking_decision ON token_lifecycle_tracking(our_decision, outcome_type);
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_tracking_time ON token_lifecycle_tracking(our_decision_at DESC);