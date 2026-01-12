-- Add columns for proper state tracking and verified entry data
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS is_on_curve BOOLEAN DEFAULT TRUE;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS bonding_curve_progress FLOAT;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS price_source TEXT;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS price_fetched_at TIMESTAMPTZ;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS entry_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS entry_verified_at TIMESTAMPTZ;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS buy_amount_sol FLOAT;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS buy_fee_sol FLOAT;

-- Add index for curve status queries
CREATE INDEX IF NOT EXISTS idx_flip_positions_is_on_curve ON flip_positions(is_on_curve) WHERE status = 'holding';

-- Add comment for documentation
COMMENT ON COLUMN flip_positions.is_on_curve IS 'True if token is still on pump.fun bonding curve, false if graduated to Raydium';
COMMENT ON COLUMN flip_positions.bonding_curve_progress IS 'Percentage of bonding curve completion (0-100)';
COMMENT ON COLUMN flip_positions.price_source IS 'Source of last price fetch: pumpfun_curve, dexscreener, jupiter, helius_rpc';
COMMENT ON COLUMN flip_positions.entry_verified IS 'True if entry price was verified from on-chain transaction data';
COMMENT ON COLUMN flip_positions.buy_amount_sol IS 'Verified SOL amount spent on buy (from on-chain)';
COMMENT ON COLUMN flip_positions.buy_fee_sol IS 'Transaction fee paid in SOL';