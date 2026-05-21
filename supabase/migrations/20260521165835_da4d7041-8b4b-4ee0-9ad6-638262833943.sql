CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('launcher-mint-watcher') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='launcher-mint-watcher');
SELECT cron.unschedule('launcher-position-monitor') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='launcher-position-monitor');

SELECT cron.schedule(
  'launcher-mint-watcher',
  '*/3 * * * * *',
  $$ select net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/launcher-mint-watcher',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'launcher-position-monitor',
  '*/5 * * * * *',
  $$ select net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/launcher-position-monitor',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) $$
);