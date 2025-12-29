-- Fix existing entries where caller is Phanes - use channel_name instead
UPDATE telegram_fantasy_positions 
SET 
  caller_username = COALESCE(channel_name, caller_username),
  caller_display_name = COALESCE(channel_name, caller_display_name)
WHERE (caller_username = 'Phanes' OR caller_display_name = 'Phanes' OR caller_display_name ILIKE '%phanes%')
AND channel_name IS NOT NULL;