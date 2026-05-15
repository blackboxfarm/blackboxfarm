-- Reschedule allstar-mint-auditor: every 30 minutes, FULL sweep of all active allstars,
-- background mode so we don't hit the 150s edge-runtime idle ceiling.
SELECT cron.unschedule('allstar-mint-auditor-30min');

SELECT cron.schedule(
  'allstar-mint-auditor-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/allstar-mint-auditor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"audit_batch_size": 5000, "hours_lookback": 1, "background": true}'::jsonb
  ) AS request_id;
  $$
);