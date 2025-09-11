-- First, unschedule any existing cron jobs for process-blackbox-commands
SELECT cron.unschedule(jobname) 
FROM cron.job 
WHERE jobname LIKE '%process-blackbox-commands%' OR jobname LIKE '%blackbox%';

-- Create a new cron job that runs every minute
SELECT cron.schedule(
  'process-blackbox-commands-every-minute',
  '* * * * *', -- every minute
  $$
  SELECT
    net.http_post(
        url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/process-blackbox-commands',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDU5MTMwNSwiZXhwIjoyMDcwMTY3MzA1fQ.B5_GVrQvCsGWjl5TjCfYBqd-F7wnJCJ6Hp2rrCqbdXo"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);