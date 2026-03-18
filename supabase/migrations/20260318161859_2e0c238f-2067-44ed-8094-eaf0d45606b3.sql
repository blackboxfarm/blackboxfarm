UPDATE api_service_config 
SET is_paid_service = false, 
    tier = 'free',
    monthly_quota = 10000000,
    cost_per_unit = 0,
    cost_per_credit_usd = 0,
    notes = 'FREE tier: 10M CU/month, 1000 req/60s. Uses public-api.solscan.io only. Pro endpoints (pro-api.solscan.io/v2.0) are DISABLED - require $199/mo Level 2 subscription. Pro features flagged as not-in-service for future activation.',
    is_enabled = true,
    updated_at = now()
WHERE service_name = 'solscan'