
-- Disable the 4 high-abuse cron jobs by job ID
SELECT cron.unschedule(14); -- arb-scanner-scheduler (every 10 seconds)
SELECT cron.unschedule(15); -- arb-scanner-every-minute
SELECT cron.unschedule(1);  -- trading-monitor-job
SELECT cron.unschedule(9);  -- process-blackbox-commands-every-minute
