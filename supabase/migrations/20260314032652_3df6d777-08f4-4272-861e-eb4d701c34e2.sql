
-- CRITICAL FIX: Remove plaintext secret_key column from wallet_pools
-- All code now uses secret_key_encrypted. Make encrypted column NOT NULL first.
UPDATE public.wallet_pools 
SET secret_key_encrypted = secret_key 
WHERE secret_key_encrypted IS NULL AND secret_key IS NOT NULL AND secret_key != '***';

-- Make secret_key_encrypted NOT NULL
ALTER TABLE public.wallet_pools ALTER COLUMN secret_key_encrypted SET NOT NULL;

-- Drop the plaintext column
ALTER TABLE public.wallet_pools DROP COLUMN secret_key;
