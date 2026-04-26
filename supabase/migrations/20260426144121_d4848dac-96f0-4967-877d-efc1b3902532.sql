create or replace function public.increment_xcrq_attempt(p_community_id text, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.x_community_resolution_queue
     set attempts   = coalesce(attempts, 0) + 1,
         last_error = p_error
   where community_id = p_community_id
     and resolved_at is null;
$$;

revoke all on function public.increment_xcrq_attempt(text, text) from public;
grant execute on function public.increment_xcrq_attempt(text, text) to service_role;

-- Schedule the queue drainer to run every 5 minutes via pg_cron + pg_net
-- (uses the existing project anon key the rest of our crons use)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any prior schedule with this name
do $$
begin
  perform cron.unschedule('drain-x-community-resolution-queue');
exception when others then null;
end $$;

select cron.schedule(
  'drain-x-community-resolution-queue',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/backfill-x-community-members',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"limit":30}'::jsonb
  ) as request_id;
  $$
);