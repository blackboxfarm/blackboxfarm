-- Create cron jobs for the multi-function token monitor architecture

-- Function 1: Token Fetcher - runs every minute
SELECT cron.schedule(
  'pumpfun-token-fetcher',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-token-fetcher?action=fetch',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Function 2: Watchlist Monitor - runs every 2 minutes
SELECT cron.schedule(
  'pumpfun-watchlist-monitor',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-watchlist-monitor?action=monitor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Function 3: Rejected Reviewer - runs every 5 minutes
SELECT cron.schedule(
  'pumpfun-rejected-reviewer',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-rejected-reviewer?action=review',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Function 4: VIP Monitor - runs every minute
SELECT cron.schedule(
  'pumpfun-vip-monitor',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-vip-monitor?action=monitor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);