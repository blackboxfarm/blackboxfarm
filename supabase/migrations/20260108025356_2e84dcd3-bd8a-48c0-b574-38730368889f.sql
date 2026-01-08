DELETE FROM telegram_channel_config 
WHERE created_at::date = '2026-01-07' 
  AND channel_username IS NULL;