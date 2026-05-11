-- Schedule kyc-bulk-mesh-runner every 5 minutes (newest-first dev wallets)
SELECT cron.unschedule('kyc-bulk-mesh-runner-5m') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'kyc-bulk-mesh-runner-5m'
);

SELECT cron.schedule(
  'kyc-bulk-mesh-runner-5m',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/kyc-bulk-mesh-runner',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"batchSize":20,"concurrency":5,"maxDepth":6,"cooldownHours":24}'::jsonb
  );
  $$
);