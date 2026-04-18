-- Re-enable telegram channels but keep flipit off
UPDATE public.telegram_channel_config
SET is_active = true;

-- Reactivate blackbox campaigns
UPDATE public.blackbox_campaigns
SET is_active = true
WHERE is_active = false;

-- Restore intel post queue items
UPDATE public.holders_intel_post_queue
SET status = 'pending', error_message = NULL
WHERE status = 'skipped' AND error_message = 'KILL SWITCH';

-- Reschedule holdersintel-poster (every 3 minutes)
SELECT cron.schedule(
  'holdersintel-poster-3min',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/holders-intel-poster',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);