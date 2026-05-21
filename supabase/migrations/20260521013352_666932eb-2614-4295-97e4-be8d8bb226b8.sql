
-- Link DREK operator: whamNN... (old mint-farm) -> gasTzr... (clean-slate burner) -> DREK
UPDATE public.dev_wallet_reputation
SET
  total_tokens_launched = GREATEST(COALESCE(total_tokens_launched,0), 13850),
  downstream_wallets = (
    SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(downstream_wallets,'{}'::text[]) || ARRAY['gasTzr94Pmp4Gf8vknQnqxeYxdgwFjbgdJa4msYRpnB']))
  ),
  known_aliases = (
    SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(known_aliases,'{}'::text[]) || ARRAY['whamNN','DrEvilKitty001 (via burner gasTzr)']))
  ),
  is_serial_spammer = true,
  dev_pattern = 'mint_farm_operator',
  notes = COALESCE(notes,'') || E'\n[2026-05-21] Pump.fun profile shows 13,850 lifetime mints; top hit APEBAMA $67.8K. Operates clean-slate burner gasTzr94... funded via Jupiter Limit Orders Keeper (privacy hop) to launch DREK (656SThyFrumtcqewYLiTjAdALrqnpN3oodrm1NtRbrrr) with paid-verified X @DrEvilKitty001 (created 6 weeks pre-mint). Prior burner mint: forward (FWoH7X5tCX9i9bNBYzbReXrC298wT8nY4RLkcpvf3Lf1).',
  updated_at = now()
WHERE wallet_address = 'whamNNP9tHoxLg92yHvJPdYhghEoCg1qYTsh5a2oLbx';

UPDATE public.dev_wallet_reputation
SET
  dev_pattern = 'clean_slate_relaunch',
  upstream_wallets = (
    SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(upstream_wallets,'{}'::text[]) || ARRAY['whamNNP9tHoxLg92yHvJPdYhghEoCg1qYTsh5a2oLbx']))
  ),
  linked_wallets = (
    SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(linked_wallets,'{}'::text[]) || ARRAY['whamNNP9tHoxLg92yHvJPdYhghEoCg1qYTsh5a2oLbx']))
  ),
  known_aliases = (
    SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(known_aliases,'{}'::text[]) || ARRAY['DrEvilKitty001','burner of whamNN']))
  ),
  twitter_accounts = (
    SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(twitter_accounts,'{}'::text[]) || ARRAY['DrEvilKitty001']))
  ),
  notes = COALESCE(notes,'') || E'\n[2026-05-21] Clean-slate burner of operator whamNNP9tHoxLg92yHvJPdYhghEoCg1qYTsh5a2oLbx (13,850 lifetime mints on Pump.fun). Funded via Jupiter Limit Orders Keeper privacy hop. Mints: forward (FWoH...3Lf1, dust) -> DREK (656S...brrr, current). Authorities renounced. X @DrEvilKitty001 paid-verified, created 6 weeks pre-mint. Pro operator reputation-laundered relaunch, NOT solo indie.',
  updated_at = now()
WHERE wallet_address = 'gasTzr94Pmp4Gf8vknQnqxeYxdgwFjbgdJa4msYRpnB';
