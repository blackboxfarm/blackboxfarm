-- Add telegram_target_id to trading tiers for linking to message targets
ALTER TABLE telegram_trading_tiers 
ADD COLUMN telegram_target_id UUID REFERENCES telegram_message_targets(id) ON DELETE SET NULL;