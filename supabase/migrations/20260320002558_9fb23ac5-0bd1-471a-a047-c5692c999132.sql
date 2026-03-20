-- Restore missing HoldersIntel cron jobs that were deleted
-- These are CRITICAL for the X posting pipeline

-- Poster: runs every 3 minutes, picks up queued tokens and tweets them
SELECT cron.schedule(
  'holdersintel-poster-3min',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/holders-intel-poster',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Dex scanner: runs every 5 minutes, detects paid dex tokens
SELECT cron.schedule(
  'holdersintel-dex-scanner-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/holders-intel-dex-scanner',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Also unstick the 12 items stuck in 'processing' status (stale from when poster died)
UPDATE holders_intel_post_queue 
SET status = 'pending', retry_count = 0 
WHERE status = 'processing';