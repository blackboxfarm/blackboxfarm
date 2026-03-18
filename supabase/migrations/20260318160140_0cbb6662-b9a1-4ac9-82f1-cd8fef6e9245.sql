UPDATE api_service_config 
SET cost_per_unit = 0.000005, 
    cost_per_credit_usd = 0.000005
WHERE service_name = 'helius';