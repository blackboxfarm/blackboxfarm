-- Reset last_message_id to NULL for all active channels to force re-scan
UPDATE telegram_channel_config 
SET last_message_id = NULL 
WHERE is_active = true;