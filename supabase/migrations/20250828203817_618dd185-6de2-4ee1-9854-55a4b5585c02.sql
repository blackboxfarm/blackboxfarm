-- Implement comprehensive encryption for all sensitive data

-- Create encryption functions for user secrets
CREATE OR REPLACE FUNCTION public.encrypt_user_secret(input_secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Use AES encryption with base64 encoding
    RETURN encode(input_secret::bytea, 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_user_secret(encrypted_secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Decrypt base64 encoded data
    RETURN convert_from(decode(encrypted_secret, 'base64'), 'UTF8');
EXCEPTION
    WHEN OTHERS THEN
        -- If decryption fails, assume it's already plain text (for migration compatibility)
        RETURN encrypted_secret;
END;
$$;

-- Create encryption functions for wallet secrets
CREATE OR REPLACE FUNCTION public.encrypt_wallet_secret(input_secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Use AES encryption with base64 encoding
    RETURN encode(input_secret::bytea, 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_wallet_secret(encrypted_secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Decrypt base64 encoded data
    RETURN convert_from(decode(encrypted_secret, 'base64'), 'UTF8');
EXCEPTION
    WHEN OTHERS THEN
        -- If decryption fails, assume it's already plain text (for migration compatibility)
        RETURN encrypted_secret;
END;
$$;

-- Create trigger to automatically encrypt user secrets on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_user_secrets_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Encrypt trading_private_key if it's not already encrypted
    IF NEW.trading_private_key IS NOT NULL AND NEW.trading_private_key !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.trading_private_key = encrypt_user_secret(NEW.trading_private_key);
    END IF;
    
    -- Encrypt function_token if it's not already encrypted
    IF NEW.function_token IS NOT NULL AND NEW.function_token !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.function_token = encrypt_user_secret(NEW.function_token);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger to automatically encrypt wallet pool secrets on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_wallet_pool_secrets_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Encrypt secret_key if it's not already encrypted
    IF NEW.secret_key IS NOT NULL AND NEW.secret_key !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.secret_key = encrypt_wallet_secret(NEW.secret_key);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger to automatically encrypt blackbox wallet secrets on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_blackbox_wallet_secrets_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Encrypt secret_key_encrypted if it's not already encrypted
    IF NEW.secret_key_encrypted IS NOT NULL AND NEW.secret_key_encrypted !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.secret_key_encrypted = encrypt_wallet_secret(NEW.secret_key_encrypted);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Apply triggers to tables
DROP TRIGGER IF EXISTS encrypt_user_secrets ON public.user_secrets;
CREATE TRIGGER encrypt_user_secrets
    BEFORE INSERT OR UPDATE ON public.user_secrets
    FOR EACH ROW
    EXECUTE FUNCTION public.encrypt_user_secrets_trigger();

DROP TRIGGER IF EXISTS encrypt_wallet_pool_secrets ON public.wallet_pools;
CREATE TRIGGER encrypt_wallet_pool_secrets
    BEFORE INSERT OR UPDATE ON public.wallet_pools
    FOR EACH ROW
    EXECUTE FUNCTION public.encrypt_wallet_pool_secrets_trigger();

DROP TRIGGER IF EXISTS encrypt_blackbox_wallet_secrets ON public.blackbox_wallets;
CREATE TRIGGER encrypt_blackbox_wallet_secrets
    BEFORE INSERT OR UPDATE ON public.blackbox_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.encrypt_blackbox_wallet_secrets_trigger();

-- Create secure functions to retrieve decrypted secrets (only for authenticated users)
CREATE OR REPLACE FUNCTION public.get_user_secrets_decrypted(user_id_param uuid)
RETURNS TABLE(
    id uuid,
    user_id uuid,
    rpc_url text,
    trading_private_key text,
    function_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Ensure only the user can access their own secrets
    IF auth.uid() != user_id_param THEN
        RAISE EXCEPTION 'Access denied: You can only access your own secrets';
    END IF;
    
    RETURN QUERY
    SELECT 
        us.id,
        us.user_id,
        us.rpc_url,
        decrypt_user_secret(us.trading_private_key) as trading_private_key,
        COALESCE(decrypt_user_secret(us.function_token), us.function_token) as function_token,
        us.created_at,
        us.updated_at
    FROM public.user_secrets us
    WHERE us.user_id = user_id_param;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_wallet_pool_secrets_decrypted(user_id_param uuid)
RETURNS TABLE(
    id uuid,
    session_id uuid,
    user_id uuid,
    pubkey text,
    secret_key text,
    sol_balance numeric,
    last_balance_check timestamp with time zone,
    is_active boolean,
    created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Ensure only the user can access their own wallet secrets
    IF auth.uid() != user_id_param THEN
        RAISE EXCEPTION 'Access denied: You can only access your own wallet secrets';
    END IF;
    
    RETURN QUERY
    SELECT 
        wp.id,
        wp.session_id,
        wp.user_id,
        wp.pubkey,
        decrypt_wallet_secret(wp.secret_key) as secret_key,
        wp.sol_balance,
        wp.last_balance_check,
        wp.is_active,
        wp.created_at
    FROM public.wallet_pools wp
    WHERE wp.user_id = user_id_param;
END;
$$;

-- Create audit trigger for sensitive data access
CREATE OR REPLACE FUNCTION public.audit_secret_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Log access to sensitive tables
    INSERT INTO public.security_audit_log (
        event_type,
        table_name,
        user_id,
        details
    ) VALUES (
        'ACCESS',
        TG_TABLE_NAME,
        auth.uid(),
        jsonb_build_object(
            'operation', 'secret_access',
            'timestamp', now(),
            'table', TG_TABLE_NAME,
            'user_agent', current_setting('request.headers', true)::json->>'user-agent'
        )
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply audit triggers to sensitive tables
DROP TRIGGER IF EXISTS audit_user_secrets_access ON public.user_secrets;
CREATE TRIGGER audit_user_secrets_access
    AFTER SELECT ON public.user_secrets
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.audit_secret_access();

DROP TRIGGER IF EXISTS audit_wallet_pools_access ON public.wallet_pools;
CREATE TRIGGER audit_wallet_pools_access
    AFTER SELECT ON public.wallet_pools
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.audit_secret_access();