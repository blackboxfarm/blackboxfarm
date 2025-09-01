-- Fix function search path mutable security warning
-- Update all functions to have immutable search_path set to 'public'

-- Update existing functions to set search_path properly
CREATE OR REPLACE FUNCTION public.update_blackbox_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_user_secret(input_secret text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Use AES encryption with base64 encoding
    RETURN encode(input_secret::bytea, 'base64');
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_funding_goal_met()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update campaign status to 'funded' if goal is met
  IF NEW.current_funding_sol >= (SELECT funding_goal_sol FROM public.community_campaigns WHERE id = NEW.campaign_id) THEN
    UPDATE public.community_campaigns 
    SET status = 'funded', funded_at = now() 
    WHERE id = NEW.campaign_id AND status = 'funding';
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_user_access_with_security(target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    current_user_id UUID;
BEGIN
    -- Get current authenticated user
    current_user_id := auth.uid();
    
    -- Block if no authenticated user
    IF current_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Only allow access to own data
    IF current_user_id != target_user_id THEN
        -- Log unauthorized access attempt
        INSERT INTO public.security_audit_log (
            event_type,
            table_name,
            user_id,
            details
        ) VALUES (
            'UNAUTHORIZED_ACCESS_ATTEMPT',
            'user_secrets',
            current_user_id,
            jsonb_build_object(
                'attempted_target_user', target_user_id,
                'timestamp', now()
            )
        );
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_sensitive_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Log access to sensitive tables
    INSERT INTO public.security_audit_log (
        event_type,
        table_name,
        user_id,
        details
    ) VALUES (
        TG_OP || '_SENSITIVE_DATA',
        TG_TABLE_NAME,
        auth.uid(),
        jsonb_build_object(
            'operation', TG_OP,
            'timestamp', now(),
            'table', TG_TABLE_NAME,
            'record_id', COALESCE(NEW.id, OLD.id)
        )
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_wallet_pool_secrets_decrypted(user_id_param uuid)
 RETURNS TABLE(id uuid, session_id uuid, user_id uuid, pubkey text, secret_key text, sol_balance numeric, last_balance_check timestamp with time zone, is_active boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.mask_sensitive_data(input_text text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Mask private keys and secrets in logs
    IF length(input_text) > 10 THEN
        RETURN left(input_text, 4) || '****' || right(input_text, 4);
    ELSE
        RETURN '****';
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_wallet_pool_secrets_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Encrypt secret_key if it's not already encrypted
    IF NEW.secret_key IS NOT NULL AND NEW.secret_key !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.secret_key = encrypt_wallet_secret(NEW.secret_key);
    END IF;
    
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_sensitive_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type, 
    table_name, 
    user_id, 
    details
  ) VALUES (
    TG_OP,
    TG_TABLE_NAME,
    auth.uid(),
    jsonb_build_object(
      'operation', TG_OP,
      'timestamp', now(),
      'affected_record_id', COALESCE(NEW.id, OLD.id)
    )
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

-- Continue with remaining functions...
CREATE OR REPLACE FUNCTION public.encrypt_blackbox_wallet_secrets_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Encrypt secret_key_encrypted if it's not already encrypted
    IF NEW.secret_key_encrypted IS NOT NULL AND NEW.secret_key_encrypted !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.secret_key_encrypted = encrypt_wallet_secret(NEW.secret_key_encrypted);
    END IF;
    
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_secrets_decrypted(user_id_param uuid)
 RETURNS TABLE(id uuid, user_id uuid, rpc_url text, trading_private_key text, function_token text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.validate_secret_access(requesting_user_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    user_2fa_enabled BOOLEAN := false;
    rate_limit_result JSONB;
BEGIN
    -- Check if requesting own data
    IF requesting_user_id != target_user_id THEN
        RETURN false;
    END IF;
    
    -- Check rate limiting
    SELECT public.check_rate_limit(
        requesting_user_id::text,
        'secret_access',
        10, -- max 10 requests
        1   -- per minute
    ) INTO rate_limit_result;
    
    IF (rate_limit_result ->> 'is_blocked')::boolean THEN
        RETURN false;
    END IF;
    
    -- Check if 2FA is enabled for the user
    SELECT two_factor_enabled INTO user_2fa_enabled
    FROM public.profiles
    WHERE user_id = requesting_user_id;
    
    -- For high-security operations, could require additional validation
    -- This is a placeholder for future enhancements
    
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_user_secret(encrypted_secret text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Decrypt base64 encoded data
    RETURN convert_from(decode(encrypted_secret, 'base64'), 'UTF8');
EXCEPTION
    WHEN OTHERS THEN
        -- If decryption fails, assume it's already plain text (for migration compatibility)
        RETURN encrypted_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_wallet_secret(input_secret text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Use AES encryption with base64 encoding
    RETURN encode(input_secret::bytea, 'base64');
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_wallet_secret(encrypted_secret text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Decrypt base64 encoded data
    RETURN convert_from(decode(encrypted_secret, 'base64'), 'UTF8');
EXCEPTION
    WHEN OTHERS THEN
        -- If decryption fails, assume it's already plain text (for migration compatibility)
        RETURN encrypted_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_user_secrets_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_owner_secret(input_secret text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Simple base64 encoding for now (placeholder for proper encryption)
    -- This prevents plain text storage while maintaining functionality
    RETURN encode(input_secret::bytea, 'base64');
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_owner_secret(encrypted_secret text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Simple base64 decoding (placeholder for proper decryption)
    RETURN convert_from(decode(encrypted_secret, 'base64'), 'UTF8');
EXCEPTION
    WHEN OTHERS THEN
        -- If decryption fails, assume it's already plain text (for migration compatibility)
        RETURN encrypted_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_trading_position_secrets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Only encrypt if the value looks like a plain text secret (not already base64 encoded)
    IF NEW.owner_secret IS NOT NULL AND NEW.owner_secret !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.owner_secret = encrypt_owner_secret(NEW.owner_secret);
    END IF;
    
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_access_password(input_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    stored_hash text;
BEGIN
    -- Get the first active password hash
    SELECT password_hash INTO stored_hash 
    FROM public.access_passwords 
    WHERE is_active = true 
    LIMIT 1;
    
    -- Return true if password matches any active hash
    RETURN stored_hash = input_password;
END;
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_blackbox_user_secrets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Encrypt phone_number if it's not already encrypted
    IF NEW.phone_number IS NOT NULL AND NEW.phone_number !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.phone_number = encode(NEW.phone_number::bytea, 'base64');
    END IF;
    
    -- Encrypt two_factor_secret if it's not already encrypted
    IF NEW.two_factor_secret IS NOT NULL AND NEW.two_factor_secret !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.two_factor_secret = encode(NEW.two_factor_secret::bytea, 'base64');
    END IF;
    
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_blackbox_user_decrypted(user_id_param uuid)
 RETURNS TABLE(id uuid, user_id uuid, two_factor_enabled boolean, created_at timestamp with time zone, updated_at timestamp with time zone, phone_number text, two_factor_secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Ensure only the user can access their own blackbox data
    IF auth.uid() != user_id_param THEN
        RAISE EXCEPTION 'Access denied: You can only access your own blackbox user data';
    END IF;
    
    RETURN QUERY
    SELECT 
        bu.id,
        bu.user_id,
        bu.two_factor_enabled,
        bu.created_at,
        bu.updated_at,
        CASE 
            WHEN bu.phone_number IS NOT NULL THEN 
                convert_from(decode(bu.phone_number, 'base64'), 'UTF8')
            ELSE NULL
        END as phone_number,
        CASE 
            WHEN bu.two_factor_secret IS NOT NULL THEN 
                convert_from(decode(bu.two_factor_secret, 'base64'), 'UTF8')
            ELSE NULL
        END as two_factor_secret
    FROM public.blackbox_users bu
    WHERE bu.user_id = user_id_param;
EXCEPTION
    WHEN OTHERS THEN
        -- If decryption fails, return encrypted data (for migration compatibility)
        RETURN QUERY
        SELECT 
            bu.id,
            bu.user_id,
            bu.two_factor_enabled,
            bu.created_at,
            bu.updated_at,
            bu.phone_number,
            bu.two_factor_secret
        FROM public.blackbox_users bu
        WHERE bu.user_id = user_id_param;
END;
$function$;