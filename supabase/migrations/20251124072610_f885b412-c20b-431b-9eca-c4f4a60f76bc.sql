-- Update the cron job to run every 10 seconds instead of 10 minutes
SELECT cron.unschedule('arb-scanner-scheduler');

SELECT cron.schedule(
  'arb-scanner-scheduler',
  '*/10 * * * * *',  -- Every 10 seconds
  $$SELECT public.schedule_arb_scanner()$$
);

-- Update default polling interval in config to 10 seconds
UPDATE arb_bot_config 
SET polling_interval_sec = 10 
WHERE polling_interval_sec = 60;