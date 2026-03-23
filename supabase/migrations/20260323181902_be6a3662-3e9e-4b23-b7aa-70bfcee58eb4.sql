UPDATE public.api_service_config
SET monthly_quota = 194602,
    monthly_quota_used = 4,
    billing_cycle_start = '2025-03-23',
    tier = 'paid',
    is_paid_service = true,
    notes = 'Paid plan. 194,602 credits/month. Resets April 23. API key rotated 2025-03-23.',
    api_key_last_rotated = now(),
    updated_at = now()
WHERE service_name = 'firecrawl';