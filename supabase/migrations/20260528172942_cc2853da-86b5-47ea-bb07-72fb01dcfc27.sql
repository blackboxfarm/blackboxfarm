SELECT cron.unschedule('funnel-feed-scanner-5min');
SELECT cron.schedule(
  'funnel-feed-scanner-1min',
  '* * * * *',
  $$ SELECT net.http_post(
       url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/funnel-feed-scanner',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
       body := jsonb_build_object('source','cron')
     ); $$
);