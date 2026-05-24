select cron.unschedule('blackbox-tick-every-minute');
select cron.schedule(
  'blackbox-tick-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/blackbox-tick',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  ) as request_id;
  $$
);