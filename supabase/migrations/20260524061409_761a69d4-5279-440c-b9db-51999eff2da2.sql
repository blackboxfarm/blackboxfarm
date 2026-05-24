-- Schedule blackbox-tick to run every minute via pg_cron
select cron.schedule(
  'blackbox-tick-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/blackbox-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);