-- Schedule daily developer wallet rescan at 6 AM UTC
SELECT cron.schedule(
  'developer-wallet-rescan-daily',
  '0 6 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://xnayzyrlohqgrpfdtppk.supabase.co/functions/v1/developer-wallet-rescan',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
      ),
      body:='{"batch_size": 100, "hours_lookback": 24}'::jsonb
    ) as request_id;
  $$
);