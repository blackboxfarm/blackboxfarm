
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with this name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('channel-pair-analyzer-15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'channel-pair-analyzer-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/channel-pair-analyzer',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:=concat('{"scheduled_at": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
