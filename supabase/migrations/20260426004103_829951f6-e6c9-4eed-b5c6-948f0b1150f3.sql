
-- Drop the old untiered drip cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backfill-genealogy-drip') THEN
    PERFORM cron.unschedule('backfill-genealogy-drip');
  END IF;
END $$;

-- Tier A: high-value creators (Insiders / high peak_multiplier) — every 30 min
SELECT cron.schedule(
  'backfill-genealogy-tier-a',
  '*/30 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/backfill-genealogy',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"batchSize": 10, "tier": "A"}'::jsonb
  );
  $job$
);

-- Tier B: everything else (newest-first pump.fun watchlist) — every 6 hours, off-peak
SELECT cron.schedule(
  'backfill-genealogy-tier-b',
  '0 */6 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/backfill-genealogy',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"batchSize": 25, "tier": "B"}'::jsonb
  );
  $job$
);
