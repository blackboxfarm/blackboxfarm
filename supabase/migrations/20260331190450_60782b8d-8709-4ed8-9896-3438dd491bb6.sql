
-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule hunter tweet scrape every 6 hours
SELECT cron.schedule(
  'hunter-tweet-scrape-6h',
  '15 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/twitter-hunter-scrape',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{"action": "scan-targets"}'::jsonb
  ) as request_id;
  $$
);
