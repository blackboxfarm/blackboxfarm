-- Create the missing trigger function for super admin wallets
CREATE OR REPLACE FUNCTION public.encrypt_super_admin_wallet_secrets_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Encrypt secret_key_encrypted if it's not already encrypted
    IF NEW.secret_key_encrypted IS NOT NULL AND NEW.secret_key_encrypted !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.secret_key_encrypted = encrypt_wallet_secret(NEW.secret_key_encrypted);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger for super admin wallets
DROP TRIGGER IF EXISTS encrypt_super_admin_wallet_secrets ON public.super_admin_wallets;
CREATE TRIGGER encrypt_super_admin_wallet_secrets
    BEFORE INSERT OR UPDATE ON public.super_admin_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.encrypt_super_admin_wallet_secrets_trigger();