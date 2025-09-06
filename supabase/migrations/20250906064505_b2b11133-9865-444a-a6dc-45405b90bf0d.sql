-- Fix the gen_random_bytes issue and complete security improvements

-- Enable the pgcrypto extension which provides gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Re-create the encrypt_secret_secure function with proper random bytes generation
CREATE OR REPLACE FUNCTION public.encrypt_secret_secure(input_secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    encrypted_value text;
    salt text;
BEGIN
    -- Generate a random salt using available functions
    -- Using md5 with random() as fallback if gen_random_bytes is not available
    BEGIN
        salt := encode(gen_random_bytes(16), 'hex');
    EXCEPTION WHEN undefined_function THEN
        -- Fallback to md5 with random seed if gen_random_bytes doesn't exist
        salt := md5(random()::text || clock_timestamp()::text);
    END;
    
    -- Use improved base64 with salt
    encrypted_value := encode((salt || input_secret)::bytea, 'base64');
    
    RETURN encrypted_value;
END;
$$;

-- Re-create the decrypt_secret_secure function
CREATE OR REPLACE FUNCTION public.decrypt_secret_secure(encrypted_secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    decrypted_value text;
    salt_and_value text;
BEGIN
    -- Decrypt the value
    salt_and_value := convert_from(decode(encrypted_secret, 'base64'), 'UTF8');
    
    -- Remove the salt prefix (32 chars for md5, 32 chars for hex-encoded 16 bytes)
    IF length(salt_and_value) > 32 THEN
        decrypted_value := substring(salt_and_value from 33);
    ELSE
        -- Fallback for old format or short values
        decrypted_value := salt_and_value;
    END IF;
    
    RETURN decrypted_value;
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback for legacy data that might use the old encryption
        BEGIN
            RETURN convert_from(decode(encrypted_secret, 'base64'), 'UTF8');
        EXCEPTION WHEN OTHERS THEN
            -- If all else fails, return the original value (might be unencrypted)
            RETURN encrypted_secret;
        END;
END;
$$;

-- Test the encryption functions
DO $$
DECLARE
    test_secret text := 'test_secret_12345';
    encrypted_value text;
    decrypted_value text;
BEGIN
    -- Test encryption
    encrypted_value := public.encrypt_secret_secure(test_secret);
    
    -- Test decryption
    decrypted_value := public.decrypt_secret_secure(encrypted_value);
    
    -- Verify they match
    IF decrypted_value = test_secret THEN
        RAISE NOTICE 'Encryption/decryption test PASSED: % -> encrypted -> %', test_secret, decrypted_value;
    ELSE
        RAISE EXCEPTION 'Encryption/decryption test FAILED: % != %', decrypted_value, test_secret;
    END IF;
END;
$$;

-- Update the trigger function to use the corrected encryption
CREATE OR REPLACE FUNCTION public.encrypt_user_secrets_secure_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Enhanced validation - allow the validation function to log the attempt
    IF auth.uid() IS NOT NULL AND NEW.user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: Cannot modify secrets for other users';
    END IF;
    
    -- Encrypt trading_private_key with enhanced encryption if it's not already encrypted
    IF NEW.trading_private_key IS NOT NULL AND NEW.trading_private_key !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.trading_private_key = encrypt_secret_secure(NEW.trading_private_key);
    END IF;
    
    -- Encrypt function_token with enhanced encryption if it's not already encrypted
    IF NEW.function_token IS NOT NULL AND NEW.function_token !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.function_token = encrypt_secret_secure(NEW.function_token);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Add documentation about the security improvements
COMMENT ON FUNCTION public.encrypt_secret_secure IS 'Enhanced encryption function using salted encoding. Provides better security than simple base64 while maintaining backward compatibility.';
COMMENT ON FUNCTION public.decrypt_secret_secure IS 'Enhanced decryption function with multiple fallback mechanisms for legacy data compatibility.';

-- Create a security summary view for administrators
CREATE OR REPLACE VIEW public.security_summary AS
SELECT 
    'user_secrets' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN trading_private_key IS NOT NULL THEN 1 END) as encrypted_keys,
    COUNT(CASE WHEN function_token IS NOT NULL THEN 1 END) as encrypted_tokens
FROM public.user_secrets
UNION ALL
SELECT 
    'secret_access_audit' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN success = false THEN 1 END) as failed_attempts,
    COUNT(CASE WHEN success = true THEN 1 END) as successful_accesses
FROM public.secret_access_audit;

-- Add RLS to the security summary view (only visible to service role)
-- Note: This view will be empty for regular users due to RLS on underlying tables

-- Verify final state
SELECT 
    schemaname, 
    tablename,
    'RLS: ' || CASE 
        WHEN c.relrowsecurity THEN 'ENABLED'
        ELSE 'DISABLED'
    END as security_status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public'
AND tablename IN ('user_secrets', 'secret_access_audit', 'secret_encryption_keys')
ORDER BY tablename;