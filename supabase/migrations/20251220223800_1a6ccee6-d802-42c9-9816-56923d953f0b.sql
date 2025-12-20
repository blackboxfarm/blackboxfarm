-- Remove the old hourly cron job
SELECT cron.unschedule('watchdog-mint-monitor-hourly');