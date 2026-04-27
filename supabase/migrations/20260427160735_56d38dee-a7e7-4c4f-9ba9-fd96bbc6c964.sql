
-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule any prior copies (idempotent — survives remixes)
DO $$
DECLARE j RECORD;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname IN (
    'creator-fusion-rolling-backfill',
    'creator-fusion-audit-prune',
    'creator-fusion-integrity-recalc'
  ) LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- Rolling backfill every 30 minutes
SELECT cron.schedule(
  'creator-fusion-rolling-backfill',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/creator-profile-backfill',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"limit":500}'::jsonb
  );
  $cron$
);

-- Audit prune daily 04:15 UTC
SELECT cron.schedule(
  'creator-fusion-audit-prune',
  '15 4 * * *',
  $cron$ SELECT public.prune_creator_fusion_audit(); $cron$
);

-- Integrity recalc daily 04:30 UTC
SELECT cron.schedule(
  'creator-fusion-integrity-recalc',
  '30 4 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/calculate-developer-integrity',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"recalculateAll":false,"sinceMerges":true}'::jsonb
  );
  $cron$
);
