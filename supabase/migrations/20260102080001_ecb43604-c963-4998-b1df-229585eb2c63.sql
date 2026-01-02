-- Add cron job for pumpfun-dev-wallet-monitor (every 3 minutes)
SELECT cron.schedule(
  'pumpfun-dev-wallet-monitor',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-dev-wallet-monitor?action=monitor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Add cron job for pumpfun-global-safeguards (every 5 minutes)
SELECT cron.schedule(
  'pumpfun-global-safeguards',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-global-safeguards?action=check',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);