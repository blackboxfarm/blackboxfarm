
SELECT cron.alter_job(job_id := 204::bigint, active := false);
SELECT cron.alter_job(job_id := 206::bigint, active := false);

SELECT cron.schedule(
  'reenable-genealogy-backfills',
  '0 * * * *',
  $$
  DO $body$
  BEGIN
    IF now() >= timestamptz '2026-05-14 00:00:00+00' THEN
      PERFORM cron.alter_job(job_id := 204::bigint, active := true);
      PERFORM cron.alter_job(job_id := 206::bigint, active := true);
      PERFORM cron.unschedule('reenable-genealogy-backfills');
    END IF;
  END
  $body$;
  $$
);
