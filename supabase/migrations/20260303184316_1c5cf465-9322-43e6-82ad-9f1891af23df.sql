
-- =============================================
-- CRON CLEANUP: Remove duplicates
-- =============================================
SELECT cron.unschedule('holdersintel-poster-2min');
SELECT cron.unschedule('holdersintel-poster-3min');
SELECT cron.unschedule('pumpfun-fantasy-executor');
SELECT cron.unschedule('pumpfun-fantasy-sell-monitor');

-- =============================================
-- CRON CLEANUP: Remove every-minute jobs (re-add at */5)
-- =============================================
SELECT cron.unschedule('pumpfun-buy-executor');
SELECT cron.unschedule('pumpfun-fantasy-executor-cron');
SELECT cron.unschedule('pumpfun-fantasy-sell-monitor-cron');
SELECT cron.unschedule('pumpfun-new-token-monitor-cron');
SELECT cron.unschedule('pumpfun-sell-monitor-cron');
SELECT cron.unschedule('pumpfun-vip-monitor');
SELECT cron.unschedule('pumpfun-websocket-listener');
SELECT cron.unschedule('scalp-realtime-monitor');
SELECT cron.unschedule('telegram-channel-monitor-1min');
SELECT cron.unschedule('telegram-fantasy-price-monitor-1min');

-- Remove pumpfun-token-enricher (re-add at */10)
SELECT cron.unschedule('pumpfun-token-enricher');

-- =============================================
-- RE-ADD at reduced frequencies
-- =============================================

-- pumpfun-buy-executor: */5
SELECT cron.schedule('pumpfun-buy-executor', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-buy-executor?action=execute',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);

-- pumpfun-fantasy-executor-cron: */5
SELECT cron.schedule('pumpfun-fantasy-executor-cron', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-fantasy-executor?action=execute',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);

-- pumpfun-fantasy-sell-monitor-cron: */5
SELECT cron.schedule('pumpfun-fantasy-sell-monitor-cron', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-fantasy-sell-monitor?action=monitor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);

-- pumpfun-new-token-monitor: */5
SELECT cron.schedule('pumpfun-new-token-monitor-cron', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-new-token-monitor?action=poll',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);

-- pumpfun-sell-monitor: */5
SELECT cron.schedule('pumpfun-sell-monitor-cron', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-sell-monitor?action=monitor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);

-- pumpfun-vip-monitor: */5
SELECT cron.schedule('pumpfun-vip-monitor', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-vip-monitor?action=monitor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);

-- pumpfun-websocket-listener: */5
SELECT cron.schedule('pumpfun-websocket-listener', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-websocket-listener?action=listen&duration=50',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);

-- scalp-realtime-monitor: */5
SELECT cron.schedule('scalp-realtime-monitor', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/scalp-realtime-monitor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{"source": "cron"}'::jsonb
  ) as request_id;
$$);

-- telegram-channel-monitor: */5
SELECT cron.schedule('telegram-channel-monitor-5min', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/telegram-channel-monitor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);

-- telegram-fantasy-price-monitor: */5
SELECT cron.schedule('telegram-fantasy-price-monitor-5min', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/telegram-fantasy-price-monitor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);

-- pumpfun-token-enricher: */10
SELECT cron.schedule('pumpfun-token-enricher', '*/10 * * * *', $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-token-enricher?action=enrich',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);
