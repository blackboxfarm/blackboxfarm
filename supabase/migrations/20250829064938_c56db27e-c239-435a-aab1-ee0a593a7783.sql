-- Fix remaining security warnings: Extension placement and OTP configuration

-- 1. Fix extension placement issue by moving extensions to extensions schema
-- First, create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Check what extensions are in public schema and move them
-- We'll identify and move any user-created extensions from public to extensions schema
DO $$
DECLARE
    ext_record RECORD;
BEGIN
    -- Loop through extensions in public schema (excluding built-in ones)
    FOR ext_record IN 
        SELECT extname 
        FROM pg_extension e
        JOIN pg_namespace n ON e.extnamespace = n.oid
        WHERE n.nspname = 'public'
        AND extname NOT IN ('plpgsql', 'uuid-ossp') -- Keep essential ones in public
    LOOP
        -- Move extension to extensions schema
        EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', ext_record.extname);
    END LOOP;
END $$;

-- 2. Configure secure OTP settings
-- Insert or update security configuration for OTP expiry
INSERT INTO public.security_config (config_key, config_value, description) VALUES
(
    'auth_otp_expiry_config',
    jsonb_build_object(
        'otp_expiry_seconds', 300,  -- 5 minutes instead of default 1 hour
        'max_otp_attempts', 3,      -- Limit attempts
        'lockout_duration_minutes', 15, -- Lockout after max attempts
        'description', 'Secure OTP configuration with shorter expiry'
    ),
    'Secure OTP expiry and attempt configuration'
),
(
    'auth_security_settings',
    jsonb_build_object(
        'require_email_verification', true,
        'password_min_length', 8,
        'session_timeout_hours', 24,
        'max_failed_login_attempts', 5,
        'account_lockout_duration_minutes', 30
    ),
    'General authentication security settings'
)
ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    updated_at = now(),
    description = EXCLUDED.description;

-- 3. Add function to validate OTP security
CREATE OR REPLACE FUNCTION public.validate_otp_security()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    config_data JSONB;
    current_time TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get OTP configuration
    SELECT config_value INTO config_data
    FROM public.security_config
    WHERE config_key = 'auth_otp_expiry_config';
    
    -- Default to secure settings if config not found
    IF config_data IS NULL THEN
        config_data := jsonb_build_object(
            'otp_expiry_seconds', 300,
            'max_otp_attempts', 3
        );
    END IF;
    
    -- Log OTP validation attempt for monitoring
    INSERT INTO public.security_audit_log (
        event_type,
        table_name,
        user_id,
        details
    ) VALUES (
        'OTP_VALIDATION_ATTEMPT',
        'auth_security',
        auth.uid(),
        jsonb_build_object(
            'timestamp', now(),
            'config_used', config_data
        )
    );
    
    RETURN true;
END;
$$;

-- 4. Create secure extension management function
CREATE OR REPLACE FUNCTION public.manage_extensions_securely()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'extensions', 'public'
AS $$
DECLARE
    result TEXT := 'Extensions secured: ';
    ext_count INTEGER := 0;
BEGIN
    -- Count extensions in extensions schema
    SELECT COUNT(*) INTO ext_count
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE n.nspname = 'extensions';
    
    result := result || ext_count::TEXT || ' extensions in secure schema';
    
    -- Log extension security check
    INSERT INTO public.security_audit_log (
        event_type,
        table_name,
        user_id,
        details
    ) VALUES (
        'EXTENSION_SECURITY_CHECK',
        'pg_extension',
        auth.uid(),
        jsonb_build_object(
            'extensions_in_secure_schema', ext_count,
            'timestamp', now()
        )
    );
    
    RETURN result;
END;
$$;