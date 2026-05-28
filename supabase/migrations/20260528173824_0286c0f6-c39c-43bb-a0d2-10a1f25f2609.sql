-- Revert funnel-feed-scanner cron from 1 min back to 5 min.
-- Korean channel is the public mirror of Insiders; Insiders sees tokens first,
-- so there's no need for the Korean funnel to fire the dev-wallet waterfall on
-- a 1-minute cadence.
DO $$
BEGIN
  PERFORM cron.unschedule('funnel-feed-scanner-1min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('funnel-feed-scanner-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'funnel-feed-scanner-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/funnel-feed-scanner',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);