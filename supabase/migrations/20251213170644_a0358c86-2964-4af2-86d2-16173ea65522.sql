-- Disable all Helius webhook monitoring
UPDATE whale_frenzy_config 
SET monitoring_active = false, 
    helius_webhook_id = NULL 
WHERE monitoring_active = true OR helius_webhook_id IS NOT NULL;

-- Disable all arb bots that might use Helius
UPDATE arb_bot_status 
SET is_running = false, 
    status = 'stopped'
WHERE is_running = true;

-- Comment: pg_cron is NOT installed, so no cron jobs to unschedule