CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior version of this job
DO $$ BEGIN
  PERFORM cron.unschedule('kyc-backfill-master-10m');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'kyc-backfill-master-10m',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/kyc-backfill-master',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"batchSize":25}'::jsonb
  );
  $$
);