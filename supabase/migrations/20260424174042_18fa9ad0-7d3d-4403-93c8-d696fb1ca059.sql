SELECT cron.unschedule('insiders-lifecycle-full-3h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'insiders-lifecycle-full-3h');

SELECT cron.schedule(
  'insiders-lifecycle-full-3h',
  '0 */3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/insiders-lifecycle-builder',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"source":"cron-3h","enrich":true,"enrichLimit":200,"socialsRecheck":true,"socialsLimit":50,"chainPromoter":true}'::jsonb
  );
  $$
);