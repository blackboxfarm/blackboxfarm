-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create the hourly cron job for mint-monitor-scanner
SELECT cron.schedule(
  'watchdog-mint-monitor-hourly',
  '0 * * * *', -- every hour at minute 0
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/mint-monitor-scanner',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"action": "cron_scan"}'::jsonb
  ) AS request_id;
  $$
);