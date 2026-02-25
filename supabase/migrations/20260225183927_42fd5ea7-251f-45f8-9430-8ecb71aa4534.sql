
SELECT cron.schedule(
  'audit-creator-integrity-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/audit-creator-integrity',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:=concat('{"table": "pumpfun_watchlist", "batchSize": 100, "offset": ', COALESCE((SELECT MAX(batch_offset) + 100 FROM creator_audit_results WHERE table_name = 'pumpfun_watchlist' AND matches > 0), 0), '}')::jsonb
  ) as request_id;
  $$
);
