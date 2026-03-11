-- Unschedule individual PumpFun cron jobs (replaced by pumpfun-orchestrator)
SELECT cron.unschedule('pumpfun-buy-executor');
SELECT cron.unschedule('pumpfun-fantasy-executor-cron');
SELECT cron.unschedule('pumpfun-fantasy-sell-monitor-cron');
SELECT cron.unschedule('pumpfun-global-safeguards');
SELECT cron.unschedule('pumpfun-new-token-monitor-cron');
SELECT cron.unschedule('pumpfun-rejected-reviewer');
SELECT cron.unschedule('pumpfun-sell-monitor-cron');
SELECT cron.unschedule('pumpfun-vip-monitor');
SELECT cron.unschedule('pumpfun-watchlist-monitor');
SELECT cron.unschedule('pumpfun-websocket-listener');
SELECT cron.unschedule('pumpfun-dev-wallet-monitor');
SELECT cron.unschedule('pumpfun-token-enricher');
SELECT cron.unschedule('pumpfun-comment-scanner-backfill');

-- Unschedule individual Trading/Monitoring cron jobs (replaced by trading-orchestrator)
SELECT cron.unschedule('flipit-execute-warmup');
SELECT cron.unschedule('flipit-preflight-warmup');
SELECT cron.unschedule('scalp-realtime-monitor');
SELECT cron.unschedule('top-200-tracker');
SELECT cron.unschedule('watchdog-mint-monitor-5min');
SELECT cron.unschedule('telegram-channel-monitor-5min');
SELECT cron.unschedule('telegram-fantasy-price-monitor-5min');

-- Unschedule individual HoldersIntel cron jobs (replaced by holdersintel-orchestrator)
SELECT cron.unschedule('holdersintel-dex-scanner-5min');
SELECT cron.unschedule('holdersintel-poster-5min');
SELECT cron.unschedule('holdersintel-surge-scanner-5min');
SELECT cron.unschedule('twitter-scanner-16min');

-- Schedule 3 orchestrators (all every 5 minutes)
SELECT cron.schedule(
  'pumpfun-orchestrator-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/pumpfun-orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'trading-orchestrator-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/trading-orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'holdersintel-orchestrator-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/holdersintel-orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);