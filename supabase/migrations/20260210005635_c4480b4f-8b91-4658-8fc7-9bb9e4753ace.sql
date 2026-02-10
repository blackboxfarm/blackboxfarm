-- Add encrypted column alongside existing plaintext column (backup stays intact)
ALTER TABLE public.wallet_pools 
ADD COLUMN IF NOT EXISTS secret_key_encrypted TEXT;