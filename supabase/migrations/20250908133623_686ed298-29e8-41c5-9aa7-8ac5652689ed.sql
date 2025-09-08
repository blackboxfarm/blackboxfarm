-- Update the tiktok command to have correct intervals: buy every 30 seconds, sell every 10 minutes
UPDATE blackbox_command_codes 
SET config = jsonb_set(
  jsonb_set(config, '{buyInterval}', '30'),
  '{sellInterval}', '600'
)
WHERE name = 'tiktok' AND is_active = true;

-- Also update the cron job to run more frequently for better precision (every 5 seconds)
SELECT cron.unschedule('process-blackbox-commands-job');
SELECT cron.schedule('process-blackbox-commands-job', '*/5 * * * * *', 'SELECT process_active_blackbox_commands();');