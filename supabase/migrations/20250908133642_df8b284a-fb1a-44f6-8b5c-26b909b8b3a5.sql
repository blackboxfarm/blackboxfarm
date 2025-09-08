-- Update the tiktok command to have correct intervals: buy every 30 seconds, sell every 10 minutes
UPDATE blackbox_command_codes 
SET config = jsonb_set(
  jsonb_set(config, '{buyInterval}', '30'),
  '{sellInterval}', '600'
)
WHERE name = 'tiktok' AND is_active = true;