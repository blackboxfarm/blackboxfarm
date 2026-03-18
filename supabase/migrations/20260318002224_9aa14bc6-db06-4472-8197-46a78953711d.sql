
-- Schedule monthly quota reset on 1st of each month at 00:05 UTC
SELECT cron.schedule(
  'reset-monthly-quotas',
  '5 0 1 * *',
  $$
  SELECT net.http_post(
    url:='https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/reset-monthly-quotas',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body:='{"source": "cron"}'::jsonb
  ) as request_id;
  $$
);

-- Populate cost_per_credit_usd for paid services
-- Helius: Business plan ~$499/mo for 500M credits = $0.000001/credit
UPDATE public.api_service_config SET cost_per_credit_usd = 0.000001 WHERE service_name = 'helius';
-- Apify: ~$49/mo for compute units, rough estimate per call
UPDATE public.api_service_config SET cost_per_credit_usd = 0.001 WHERE service_name = 'apify';
-- Firecrawl: ~$16/mo for 500 credits = $0.032/credit
UPDATE public.api_service_config SET cost_per_credit_usd = 0.032 WHERE service_name = 'firecrawl';
-- Free APIs (DexScreener, Jupiter, Pumpfun, Rugcheck, CoinGecko, Solscan)
UPDATE public.api_service_config SET cost_per_credit_usd = 0 WHERE service_name IN ('dexscreener', 'jupiter', 'pumpfun', 'rugcheck', 'coingecko', 'solscan', 'bagsfm', 'bonkfun');
