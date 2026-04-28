-- Extend allowed wallet_type values to include legacy BumpBot wallets
ALTER TABLE public.super_admin_wallets DROP CONSTRAINT IF EXISTS super_admin_wallets_wallet_type_check;
ALTER TABLE public.super_admin_wallets ADD CONSTRAINT super_admin_wallets_wallet_type_check
  CHECK (wallet_type = ANY (ARRAY['treasury','campaign_funding','refund_processing','emergency','flipit','bumpbot_legacy']));

-- Copy legacy BumpBot wallet into super_admin_wallets (idempotent)
INSERT INTO public.super_admin_wallets (label, pubkey, secret_key_encrypted, wallet_type, is_active)
SELECT 'Legacy BumpBot Wallet', bw.pubkey, bw.secret_key_encrypted, 'bumpbot_legacy', true
FROM public.blackbox_wallets bw
WHERE bw.pubkey = 'Hg6eNemZ4eeA5KAbQYTN5bAojeaMgZ8Fpjgv3RFm6eCU'
  AND NOT EXISTS (
    SELECT 1 FROM public.super_admin_wallets saw WHERE saw.pubkey = bw.pubkey
  );