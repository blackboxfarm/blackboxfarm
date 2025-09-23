-- Delete remaining fake/malformed wallets
DELETE FROM blackbox_wallets WHERE secret_key_encrypted LIKE '%DUMMY%' OR secret_key_encrypted LIKE '%PLACEHOLDER%' OR pubkey LIKE 'CUP%' OR pubkey LIKE 'PSY%' OR secret_key_encrypted LIKE '%Q==';

-- Also delete any campaign_wallets relationships that might point to deleted wallets
DELETE FROM campaign_wallets WHERE wallet_id NOT IN (SELECT id FROM blackbox_wallets);