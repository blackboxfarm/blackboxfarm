UPDATE api_provider_config SET is_enabled = true, priority = 1 WHERE provider_name = 'helius';
UPDATE api_provider_config SET priority = 99 WHERE provider_name = 'solscan';