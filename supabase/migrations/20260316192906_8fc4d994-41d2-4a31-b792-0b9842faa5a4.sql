
-- Clean up unverified UNKNOWN jupx alerts from butthole dev that were detected without on-chain timestamp verification
DELETE FROM allstar_mint_alerts 
WHERE creator_wallet = 'AV7PjXHL5JXZ1YoYRoN9Dsstg1x2UciBupMCXcJP8gUz'
  AND token_symbol = 'UNKNOWN'
  AND token_mint LIKE '%jupx';

-- Also clean the single UNKNOWN jupx from the Clanker dev  
DELETE FROM allstar_mint_alerts 
WHERE creator_wallet = 'tQi75x9GeqsDeFdPVdwn6fwfiNLog53STe56Wjt4MVj'
  AND token_symbol = 'UNKNOWN'
  AND token_mint LIKE '%jupx';

-- Reset new_mints_found counter on butthole dev since those were false positives
UPDATE allstar_dev_registry 
SET new_mints_found = 0, 
    last_mint_detected_at = NULL,
    updated_at = now()
WHERE master_wallet = 'AV7PjXHL5JXZ1YoYRoN9Dsstg1x2UciBupMCXcJP8gUz';

-- Same for clanker dev
UPDATE allstar_dev_registry 
SET new_mints_found = 0,
    last_mint_detected_at = NULL, 
    updated_at = now()
WHERE master_wallet = 'tQi75x9GeqsDeFdPVdwn6fwfiNLog53STe56Wjt4MVj';
