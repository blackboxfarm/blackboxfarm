-- First, let's check if there's an existing cron job
SELECT cron.unschedule('process-active-blackbox-commands');

-- Create the cron job with proper JSON formatting
SELECT cron.schedule(
  'process-active-blackbox-commands',
  '* * * * *', -- every minute
  $$
  SELECT public.process_active_blackbox_commands();
  $$
);