-- Update pumpfun_blacklist to allow token_address entry type
ALTER TABLE public.pumpfun_blacklist DROP CONSTRAINT IF EXISTS pumpfun_blacklist_entry_type_check;
ALTER TABLE public.pumpfun_blacklist ADD CONSTRAINT pumpfun_blacklist_entry_type_check 
  CHECK (entry_type IN ('token_address', 'dev_wallet', 'mint_wallet', 'funding_wallet', 'suspicious_wallet', 'pumpfun_account', 'twitter_account', 'telegram_account', 'kyc_wallet'));

-- Update pumpfun_whitelist to allow token_address entry type
ALTER TABLE public.pumpfun_whitelist DROP CONSTRAINT IF EXISTS pumpfun_whitelist_entry_type_check;
ALTER TABLE public.pumpfun_whitelist ADD CONSTRAINT pumpfun_whitelist_entry_type_check 
  CHECK (entry_type IN ('token_address', 'dev_wallet', 'mint_wallet', 'funding_wallet', 'trusted_wallet', 'pumpfun_account', 'twitter_account', 'telegram_account', 'kyc_wallet'));