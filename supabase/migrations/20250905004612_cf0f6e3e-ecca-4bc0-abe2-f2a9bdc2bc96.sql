-- Create the cron job properly
SELECT cron.schedule(
  'process-blackbox-commands',
  '* * * * *', -- every minute
  $$
  SELECT public.process_active_blackbox_commands();
  $$
);