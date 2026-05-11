ALTER TABLE public.token_lifecycle
  ADD COLUMN IF NOT EXISTS first_24h_ath_usd numeric,
  ADD COLUMN IF NOT EXISTS first_24h_ath_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_24h_ath_source text;

CREATE INDEX IF NOT EXISTS idx_token_lifecycle_first_24h_ath_pending
  ON public.token_lifecycle (first_seen_at DESC)
  WHERE first_24h_ath_usd IS NULL;

-- Cron: live sealer every 5 minutes
SELECT cron.schedule(
  'first-24h-ath-sealer-5m',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/first-24h-ath-sealer',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Cron: backfill every 10 minutes
SELECT cron.schedule(
  'first-24h-ath-backfill-10m',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/first-24h-ath-backfill',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);