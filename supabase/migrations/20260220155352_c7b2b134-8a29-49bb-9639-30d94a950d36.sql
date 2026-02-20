-- Add nickname column to wallet_pools and blackbox_wallets for label editing
ALTER TABLE public.wallet_pools ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.blackbox_wallets ADD COLUMN IF NOT EXISTS nickname text;