-- Create a pg_cron job to run process-blackbox-commands every 10 seconds
-- First, remove any existing job
SELECT cron.unschedule('process-blackbox-commands-job');

-- Create new job that runs every 10 seconds
SELECT cron.schedule('process-blackbox-commands-job', '*/10 * * * * *', 'SELECT process_active_blackbox_commands();');