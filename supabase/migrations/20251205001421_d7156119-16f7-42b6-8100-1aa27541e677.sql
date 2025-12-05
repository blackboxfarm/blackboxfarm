-- Add individual distribution percentages for each wallet
ALTER TABLE mega_whale_alert_config 
ADD COLUMN IF NOT EXISTS distribution_percent_wallet_1 integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS distribution_percent_wallet_2 integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS distribution_percent_wallet_3 integer DEFAULT 10;

-- Drop the old combined column if it exists (optional - keep for backwards compat)
COMMENT ON COLUMN mega_whale_alert_config.distribution_percent_per_wallet IS 'Deprecated - use individual wallet percentages instead';