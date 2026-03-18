-- Fix Apify cost_per_unit to reflect actual ~$0.50/actor run
UPDATE api_service_config
SET cost_per_unit = 0.50,
    cost_per_credit_usd = 0.50,
    notes = 'Apify actor runs ~$0.25-$1.00 each, using $0.50 avg. Callers: x-community-enricher, social-larp-detector, twitter-profile-enricher, pumpfun-kol-twitter-scanner, bulk-community-enricher.',
    updated_at = now()
WHERE service_name = 'apify';

-- Add Firecrawl as its own service (was previously misattributed to apify)
INSERT INTO api_service_config (
  service_name, display_name, description, is_paid_service, is_enabled,
  tier, rate_limit_per_minute, monthly_quota, monthly_quota_used,
  cost_per_unit, cost_per_credit_usd, currency,
  documentation_url, dashboard_url, notes
) VALUES (
  'firecrawl', 'Firecrawl', 'Web scraping and data extraction', true, true,
  'starter', 20, 500, 0,
  0.004, 0.004, 'USD',
  'https://docs.firecrawl.dev', 'https://firecrawl.dev/app',
  'Starter plan: 500 credits/mo. Previously logged under apify service_name.'
) ON CONFLICT (service_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_paid_service = EXCLUDED.is_paid_service,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Re-attribute historical firecrawl calls from apify to firecrawl
UPDATE api_usage_log
SET service_name = 'firecrawl'
WHERE service_name = 'apify'
  AND (function_name = 'firecrawl-scrape' OR endpoint LIKE '%/v1/scrape%');