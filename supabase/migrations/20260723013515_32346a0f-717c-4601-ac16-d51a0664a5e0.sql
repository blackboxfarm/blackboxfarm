
ALTER TABLE public.alpha_paper_trades
  ADD COLUMN IF NOT EXISTS target_multiplier numeric DEFAULT 2,
  ADD COLUMN IF NOT EXISTS peak_price_usd numeric,
  ADD COLUMN IF NOT EXISTS peak_market_cap numeric,
  ADD COLUMN IF NOT EXISTS peak_multiplier numeric,
  ADD COLUMN IF NOT EXISTS peak_at timestamptz,
  ADD COLUMN IF NOT EXISTS exit_price_usd numeric,
  ADD COLUMN IF NOT EXISTS exit_market_cap numeric,
  ADD COLUMN IF NOT EXISTS exit_multiplier numeric,
  ADD COLUMN IF NOT EXISTS exit_reason text,
  ADD COLUMN IF NOT EXISTS exit_at timestamptz,
  ADD COLUMN IF NOT EXISTS pnl_usd numeric,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_alpha_paper_trades_open_monitor
  ON public.alpha_paper_trades (status, last_checked_at NULLS FIRST)
  WHERE status = 'open';

-- Default new paper trades to $10 / 2x-target strategy
UPDATE public.alpha_config
   SET paper_size_usd = 10
 WHERE id = 1 AND paper_size_usd = 100;

-- pg_cron: monitor open paper trades every minute
DO $$
BEGIN
  PERFORM cron.unschedule('alpha-paper-monitor-1m');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'alpha-paper-monitor-1m',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/alpha-paper-monitor',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $$
);
