-- Drop the stale CHECK constraint that only allowed 6 hardcoded labels.
-- The new mesh-kyc-deep-search writes prefixed labels like
-- 'helius_chain:Coinbase Hot Wallet' or 'solscan_direct:Binance', which
-- were silently failing the upsert and leaving kyc_verified=false forever.
ALTER TABLE public.developer_profiles
  DROP CONSTRAINT IF EXISTS developer_profiles_kyc_source_check;

-- Refresh the matview so the Coverage panel reflects any rows that land
-- on the next cron tick (the 30-min refresh cron will keep it fresh).
REFRESH MATERIALIZED VIEW CONCURRENTLY public.master_token_directory;

-- Tighten the refresh cron from every 2h to every 10 min so progress is visible.
SELECT cron.unschedule('refresh-master-token-directory') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-master-token-directory'
);
SELECT cron.schedule(
  'refresh-master-token-directory',
  '*/10 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.master_token_directory$$
);