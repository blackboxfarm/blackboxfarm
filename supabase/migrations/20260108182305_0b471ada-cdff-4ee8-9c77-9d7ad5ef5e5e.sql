-- Set aggressive polling for INSIDER WALLET TRACKING channels
UPDATE telegram_channel_config 
SET polling_interval_seconds = 10 
WHERE channel_name = 'INSIDER WALLET TRACKING';

-- Add price_monitor_interval_seconds column to allow per-channel price check frequency
ALTER TABLE telegram_channel_config 
ADD COLUMN IF NOT EXISTS price_monitor_interval_seconds INTEGER DEFAULT 60;

-- Set aggressive price monitoring for INSIDER WALLET TRACKING (every 15 seconds)
UPDATE telegram_channel_config 
SET price_monitor_interval_seconds = 15 
WHERE channel_name = 'INSIDER WALLET TRACKING';