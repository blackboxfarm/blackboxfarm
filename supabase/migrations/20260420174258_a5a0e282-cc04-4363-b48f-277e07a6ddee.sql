SELECT cron.unschedule('holdersintel-surge-scanner-5min');
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'phanes-x-backfill'),
  schedule := '*/15 * * * *'
);