CREATE OR REPLACE FUNCTION public.encrypt_trading_position_secrets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.owner_secret_encrypted IS NOT NULL AND NEW.owner_secret_encrypted !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.owner_secret_encrypted = encrypt_owner_secret(NEW.owner_secret_encrypted);
    END IF;
    RETURN NEW;
END;
$$;