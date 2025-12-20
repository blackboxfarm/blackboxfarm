-- Add notification_emails column to mint_monitor_wallets
ALTER TABLE mint_monitor_wallets 
ADD COLUMN notification_emails text[] DEFAULT '{}';

-- Set default emails for existing wallets
UPDATE mint_monitor_wallets 
SET notification_emails = ARRAY['admin@blackbox.farm', 'wilsondavid@live.ca']
WHERE is_cron_enabled = true;