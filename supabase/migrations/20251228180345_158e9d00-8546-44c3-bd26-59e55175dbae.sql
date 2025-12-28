-- Add SOL amount column for FlipIt auto-buy (primary input, USD is derived)
ALTER TABLE telegram_channel_config
ADD COLUMN IF NOT EXISTS flipit_buy_amount_sol NUMERIC DEFAULT 0.1;