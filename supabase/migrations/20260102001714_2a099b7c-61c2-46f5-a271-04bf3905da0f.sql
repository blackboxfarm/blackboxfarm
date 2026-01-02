
-- Step 1: Unschedule the old broken token fetcher
SELECT cron.unschedule('pumpfun-token-fetcher');

-- Step 2: Truncate the table to clear any API-sourced tokens
TRUNCATE TABLE pumpfun_watchlist;

-- Step 3: Schedule the new WebSocket listener (every minute, listens for 50 seconds)
SELECT cron.schedule(
  'pumpfun-websocket-listener',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-websocket-listener?action=listen&duration=50',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Step 4: Schedule the token enricher (every minute, processes pending_triage tokens)
SELECT cron.schedule(
  'pumpfun-token-enricher',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-token-enricher?action=enrich',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
