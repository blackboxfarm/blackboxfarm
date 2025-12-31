-- Add enhanced Scalp Mode settings to telegram_channel_config
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_buy_amount_sol numeric;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_buy_slippage_bps integer DEFAULT 1000;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_sell_slippage_bps integer DEFAULT 1500;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_buy_priority_fee text DEFAULT 'medium';
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_sell_priority_fee text DEFAULT 'high';

-- Add comment for documentation
COMMENT ON COLUMN telegram_channel_config.scalp_buy_amount_sol IS 'Buy amount in SOL for scalp mode trades';
COMMENT ON COLUMN telegram_channel_config.scalp_buy_slippage_bps IS 'Buy slippage in basis points (1000 = 10%)';
COMMENT ON COLUMN telegram_channel_config.scalp_sell_slippage_bps IS 'Sell slippage in basis points (1500 = 15%)';
COMMENT ON COLUMN telegram_channel_config.scalp_buy_priority_fee IS 'Priority fee mode for buys: low, medium, high, turbo, ultra';
COMMENT ON COLUMN telegram_channel_config.scalp_sell_priority_fee IS 'Priority fee mode for sells: low, medium, high, turbo, ultra';