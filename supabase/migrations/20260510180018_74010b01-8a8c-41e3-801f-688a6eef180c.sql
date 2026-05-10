-- Speed up KYC backfill (every 2 min, larger batch) and add creator-wallet-resolver cron
-- to fill the 40k tokens missing a dev wallet.

-- 1) Replace existing kyc-backfill schedule with 2-minute cadence + batch 100
SELECT cron.unschedule('kyc-backfill-master-10m') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname='kyc-backfill-master-10m'
);

SELECT cron.schedule(
  'kyc-backfill-master-2m',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/kyc-backfill-master',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"batchSize":100}'::jsonb
  );
  $$
);

-- 2) New: creator-wallet-resolver every 2 min, batch 50
SELECT cron.schedule(
  'creator-wallet-resolver-2m',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/creator-wallet-resolver',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"batchSize":50}'::jsonb
  );
  $$
);