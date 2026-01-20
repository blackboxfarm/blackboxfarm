-- Fix "Blind Ape Alpha" channel to enable LIVE trading (disable watch mode)
UPDATE telegram_channel_config 
SET 
  watch_mode_fantasy_only = false,
  fantasy_mode = false
WHERE id = '99e1e283-7351-42ef-8ce0-97a68df77210';