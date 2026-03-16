-- Schedule monthly archive of old morning reports (1st of every month at midnight UTC)
SELECT cron.schedule(
  'archive-morning-reports-monthly',
  '0 0 1 * *',
  $$SELECT public.archive_old_morning_reports();$$
);