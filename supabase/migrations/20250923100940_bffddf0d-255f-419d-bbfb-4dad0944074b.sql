-- Delete fake placeholder wallets that were accidentally created
DELETE FROM blackbox_wallets WHERE pubkey LIKE 'CUP%' OR pubkey LIKE 'PSY%';