-- Fix security warnings with alternative approach
-- Some extensions cannot be moved, so we'll configure secure settings instead

-- 1. Create extensions schema for future extensions (without moving existing ones)
CREATE SCHEMA IF NOT EXISTS extensions;

-- 2. Add documentation and monitoring for extension security
INSERT INTO public.security_config (config_key, config_value, description) VALUES
(
    'extension_security_policy',
    jsonb_build_object(
        'allowed_public_extensions', ARRAY['plpgsql', 'uuid-ossp', 'pg_net', 'pg_stat_statements'],
        'policy', 'System extensions in public schema are managed by Supabase',
        'new_extensions_schema', 'extensions',
        'security_note', 'Critical system extensions remain in public for compatibility'
    ),
    'Extension placement security policy and documentation'
),
(
    'auth_otp_security_config',
    jsonb_build_object(
        'recommended_otp_expiry_seconds', 300,
        'current_setting_note', 'OTP expiry should be configured via Supabase dashboard',
        'security_recommendation', 'Use 5 minutes or less for OTP expiry',
        'dashboard_path', 'Authentication > Settings > OTP expiry'
    ),
    'OTP security configuration recommendations'
)
ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    updated_at = now(),
    description = EXCLUDED.description;

-- 3. Create function to check current security status
CREATE OR REPLACE FUNCTION public.get_security_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    result JSONB;
    extension_count INTEGER;
    public_extensions TEXT[];
BEGIN
    -- Count extensions in public schema
    SELECT COUNT(*), array_agg(extname)
    INTO extension_count, public_extensions
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE n.nspname = 'public';
    
    -- Build status report
    result := jsonb_build_object(
        'extensions_in_public', extension_count,
        'public_extensions', public_extensions,
        'security_note', 'System extensions (pg_net, etc.) must remain in public schema',
        'recommendation', 'Configure OTP expiry via Supabase dashboard for remaining warning',
        'timestamp', now()
    );
    
    -- Log security status check
    INSERT INTO public.security_audit_log (
        event_type,
        table_name,
        user_id,
        details
    ) VALUES (
        'SECURITY_STATUS_CHECK',
        'system_security',
        auth.uid(),
        result
    );
    
    RETURN result;
END;
$$;

-- 4. Add security monitoring trigger for extension changes
CREATE OR REPLACE FUNCTION public.monitor_extension_changes()
RETURNS EVENT_TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Log any extension-related DDL commands
    INSERT INTO public.security_audit_log (
        event_type,
        table_name,
        user_id,
        details
    ) VALUES (
        'EXTENSION_DDL_COMMAND',
        'pg_extension',
        auth.uid(),
        jsonb_build_object(
            'command_tag', tg_tag,
            'timestamp', now(),
            'note', 'Extension operation detected'
        )
    );
END;
$$;

-- Create the event trigger (if possible)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'monitor_extensions') THEN
        CREATE EVENT TRIGGER monitor_extensions
        ON ddl_command_end
        WHEN TAG IN ('CREATE EXTENSION', 'DROP EXTENSION', 'ALTER EXTENSION')
        EXECUTE FUNCTION monitor_extension_changes();
    END IF;
EXCEPTION WHEN insufficient_privilege THEN
    -- Event triggers require superuser, so we'll log this limitation
    INSERT INTO public.security_audit_log (
        event_type,
        table_name,
        user_id,
        details
    ) VALUES (
        'SECURITY_SETUP_NOTE',
        'system_security',
        auth.uid(),
        jsonb_build_object(
            'note', 'Extension monitoring requires manual oversight',
            'timestamp', now()
        )
    );
END $$;