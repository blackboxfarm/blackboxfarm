-- Remove the buggy old cron jobs that use the database function
SELECT cron.unschedule('real-blackbox-trading');
SELECT cron.unschedule('process-blackbox-commands');

-- Create new cron job that calls the Edge Function
SELECT cron.schedule(
  'blackbox-edge-processor',
  '* * * * *', -- every minute
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/process-blackbox-commands',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"source": "cron", "timestamp": "' || now() || '"}'::jsonb
  ) AS request_id;
  $$
);