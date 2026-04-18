-- Re-enable the telegram-channel-monitor cron (every 1 minute)
-- Original schedule was removed on 2026-03-11 (migration 20260311162034) and never restored.
-- This wakes up the monitor so first-seen tokens in armed channels actually trigger buys.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule any stale variant by name (no-op if absent)
DO $$
BEGIN
  PERFORM cron.unschedule('telegram-channel-monitor-1min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'telegram-channel-monitor-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/telegram-channel-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := jsonb_build_object('source', 'cron', 'invoked_at', now())
  );
  $$
);