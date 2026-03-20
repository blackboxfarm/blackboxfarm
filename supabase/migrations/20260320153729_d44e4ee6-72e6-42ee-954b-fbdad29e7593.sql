UPDATE api_service_config
SET is_enabled = false,
    notes = notes || ' | Disabled 2026-03-20: free tier only, Pro endpoints blocked in code. Reversal: SET is_enabled = true.'
WHERE service_name = 'solscan';