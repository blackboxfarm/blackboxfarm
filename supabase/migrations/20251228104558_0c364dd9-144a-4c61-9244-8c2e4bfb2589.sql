-- Add missing column to telegram_channel_calls
ALTER TABLE telegram_channel_calls 
ADD COLUMN IF NOT EXISTS channel_config_id uuid REFERENCES telegram_channel_config(id);

-- Add missing column to telegram_fantasy_positions
ALTER TABLE telegram_fantasy_positions 
ADD COLUMN IF NOT EXISTS target_sell_multiplier numeric;