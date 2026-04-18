-- Activate the INSIDER WALLET TRACKING channel that has flipit auto-buy enabled
UPDATE public.telegram_channel_config
SET is_active = true, updated_at = now()
WHERE id = '2353bebd-7313-45e5-bc07-ba0553665081';

-- Schedule the telegram channel monitor to run every minute
-- (uses pg_cron + pg_net, both already enabled per existing crons)
SELECT cron.unschedule('telegram-channel-monitor-1min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'telegram-channel-monitor-1min');

SELECT cron.schedule(
  'telegram-channel-monitor-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/telegram-channel-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);