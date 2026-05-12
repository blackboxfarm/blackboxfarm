ALTER TABLE public.token_lifecycle
  ADD COLUMN IF NOT EXISTS ath_alltime_usd numeric,
  ADD COLUMN IF NOT EXISTS ath_alltime_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS ath_alltime_source text,
  ADD COLUMN IF NOT EXISTS ath_alltime_confidence text;

CREATE INDEX IF NOT EXISTS idx_token_lifecycle_ath_alltime_pending
  ON public.token_lifecycle (first_seen_at DESC)
  WHERE ath_alltime_usd IS NULL;

SELECT cron.schedule(
  'ath-alltime-backfill-15m',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/ath-alltime-backfill',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"batchSize": 40}'::jsonb
  );
  $$
);