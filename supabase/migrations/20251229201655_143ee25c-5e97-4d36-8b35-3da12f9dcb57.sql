-- Backfill Phanes caller entries with the channel name
UPDATE telegram_fantasy_positions fp
SET 
  caller_username = cc.channel_name,
  caller_display_name = cc.channel_name,
  channel_name = cc.channel_name
FROM telegram_channel_config cc
WHERE fp.channel_config_id = cc.id
  AND (fp.caller_username ILIKE '%phanes%' OR fp.caller_display_name ILIKE '%phanes%');