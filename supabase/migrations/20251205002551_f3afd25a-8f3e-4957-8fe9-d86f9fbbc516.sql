-- Add partial sell settings to auto buy config
ALTER TABLE mega_whale_auto_buy_config
ADD COLUMN IF NOT EXISTS sell_percent_initial numeric DEFAULT 100,
ADD COLUMN IF NOT EXISTS sell_percent_remaining numeric DEFAULT 100,
ADD COLUMN IF NOT EXISTS remaining_position_take_profit_pct numeric DEFAULT 100,
ADD COLUMN IF NOT EXISTS remaining_position_stop_loss_pct numeric DEFAULT 25;

-- Add comments
COMMENT ON COLUMN mega_whale_auto_buy_config.sell_percent_initial IS 'Percentage to sell on first take profit/stop loss (e.g., 50 = sell 50%)';
COMMENT ON COLUMN mega_whale_auto_buy_config.sell_percent_remaining IS 'Percentage to sell of remaining position on subsequent triggers';
COMMENT ON COLUMN mega_whale_auto_buy_config.remaining_position_take_profit_pct IS 'Take profit % for remaining position after partial sell';
COMMENT ON COLUMN mega_whale_auto_buy_config.remaining_position_stop_loss_pct IS 'Stop loss % for remaining position after partial sell';

-- Add remaining tracking fields to positions table
ALTER TABLE mega_whale_positions
ADD COLUMN IF NOT EXISTS original_amount_tokens numeric,
ADD COLUMN IF NOT EXISTS partial_sells_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_sold_tokens numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_sell_price_sol numeric;