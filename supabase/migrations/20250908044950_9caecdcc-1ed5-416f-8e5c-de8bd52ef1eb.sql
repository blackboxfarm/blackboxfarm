-- Update wallets to be associated with the most recent active campaign
UPDATE blackbox_wallets 
SET campaign_id = 'fd1a10e3-50bd-40dd-8857-82c9de19826f'
WHERE campaign_id IS NULL;

-- Also ensure commands are properly linked to wallets that now have campaigns
-- (The commands should already be linked via wallet_id, so this should work automatically)