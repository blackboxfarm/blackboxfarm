-- Add missing scalp columns to flip_positions table
ALTER TABLE flip_positions 
ADD COLUMN IF NOT EXISTS scalp_moon_bag_pct numeric;

ALTER TABLE flip_positions 
ADD COLUMN IF NOT EXISTS scalp_take_profit_pct numeric;

ALTER TABLE flip_positions 
ADD COLUMN IF NOT EXISTS scalp_stop_loss_pct numeric;

-- Update "Blind Ape Alpha 🦍" channel to use FlipIt mode (disable Scalp override)
UPDATE telegram_channel_config 
SET scalp_mode_enabled = false
WHERE id = '99e1e283-7351-42ef-8ce0-97a68df77210';