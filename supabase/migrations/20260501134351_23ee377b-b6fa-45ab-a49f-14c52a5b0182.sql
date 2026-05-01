-- Ensure required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-create the schedule idempotently
do $$
begin
  if exists (select 1 from cron.job where jobname = 'dexscreener-boost-poller-5min') then
    perform cron.unschedule('dexscreener-boost-poller-5min');
  end if;
end$$;

select cron.schedule(
  'dexscreener-boost-poller-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/dexscreener-boost-poller',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);