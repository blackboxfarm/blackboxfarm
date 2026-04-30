select cron.unschedule('feed-health-scanner-hourly')
where exists (
  select 1 from cron.job where jobname = 'feed-health-scanner-hourly'
);

select cron.schedule(
  'feed-health-scanner-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/feed-health-scanner',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"batchSize": 60, "concurrency": 3, "maxAgeMins": 55}'::jsonb
  ) as request_id;
  $$
);