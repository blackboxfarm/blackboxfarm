
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing jobs if they exist (safe to re-run)
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
  'backcheck-stop-loss-4h',
  'mesh-backfill-6h',
  'top-200-tracker',
  'developer-integrity-hourly'
);

-- Schedule stop-loss backcheck every 4 hours
SELECT cron.schedule(
  'backcheck-stop-loss-4h',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/backcheck-stop-loss-exits',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDU5MTMwNSwiZXhwIjoyMDcwMTY3MzA1fQ.B5_GVrQvCsGWjl5TjCfYBqd-F7wnJCJ6Hp2rrCqbdXo"}'::jsonb,
    body := '{"batch_size": 25, "max_batches": 20}'::jsonb
  ) as request_id;
  $$
);

-- Schedule mesh backfill/maintenance every 6 hours
SELECT cron.schedule(
  'mesh-backfill-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/backfill-rejection-mesh',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDU5MTMwNSwiZXhwIjoyMDcwMTY3MzA1fQ.B5_GVrQvCsGWjl5TjCfYBqd-F7wnJCJ6Hp2rrCqbdXo"}'::jsonb,
    body := '{"batch_size": 25, "offset": 0}'::jsonb
  ) as request_id;
  $$
);

-- Schedule top 200 tracker every 5 minutes
SELECT cron.schedule(
  'top-200-tracker',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/dexscreener-top-200-scraper',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDU5MTMwNSwiZXhwIjoyMDcwMTY3MzA1fQ.B5_GVrQvCsGWjl5TjCfYBqd-F7wnJCJ6Hp2rrCqbdXo"}'::jsonb
  ) as request_id;
  $$
);

-- Schedule developer integrity calculation hourly
SELECT cron.schedule(
  'developer-integrity-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/calculate-developer-integrity',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDU5MTMwNSwiZXhwIjoyMDcwMTY3MzA1fQ.B5_GVrQvCsGWjl5TjCfYBqd-F7wnJCJ6Hp2rrCqbdXo"}'::jsonb,
    body := '{"recalculateAll": true}'::jsonb
  ) as request_id;
  $$
);
