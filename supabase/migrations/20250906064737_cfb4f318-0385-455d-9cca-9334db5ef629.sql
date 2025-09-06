-- Fix remaining security linter issues - mainly the security definer views

-- Drop and recreate views without SECURITY DEFINER
DROP VIEW IF EXISTS public.user_security_audit;
DROP VIEW IF EXISTS public.security_summary;

-- Create user_security_audit as a regular view (not SECURITY DEFINER)
CREATE VIEW public.user_security_audit AS
SELECT 
    id,
    operation,
    secret_type,
    access_timestamp,
    success,
    CASE 
        WHEN success = false THEN failure_reason 
        ELSE 'SUCCESS' 
    END as result,
    CASE 
        WHEN metadata ? 'validation_passed' THEN jsonb_build_object('status', 'validated')
        WHEN metadata ? 'rate_limit_info' THEN jsonb_build_object('status', 'rate_limited')
        ELSE jsonb_build_object('status', 'unknown')
    END as summary
FROM public.secret_access_audit 
WHERE user_id = auth.uid();

-- Create security_summary as a regular view
CREATE VIEW public.security_summary AS
SELECT 
    'user_secrets' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN trading_private_key IS NOT NULL THEN 1 END) as encrypted_keys,
    COUNT(CASE WHEN function_token IS NOT NULL THEN 1 END) as encrypted_tokens
FROM public.user_secrets
WHERE user_id = auth.uid() -- Only show current user's data
UNION ALL
SELECT 
    'secret_access_audit' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN success = false THEN 1 END) as failed_attempts,
    COUNT(CASE WHEN success = true THEN 1 END) as successful_accesses
FROM public.secret_access_audit
WHERE user_id = auth.uid(); -- Only show current user's data

-- Update any remaining functions to have proper search_path
-- Check the validate_secret_access_enhanced function
CREATE OR REPLACE FUNCTION public.validate_secret_access_enhanced(
    requesting_user_id uuid, 
    target_user_id uuid,
    operation text DEFAULT 'read',
    secret_type text DEFAULT 'unknown'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    user_2fa_enabled BOOLEAN := false;
    rate_limit_result JSONB;
BEGIN
    -- Block if not accessing own data
    IF requesting_user_id != target_user_id THEN
        -- Log unauthorized access attempt
        INSERT INTO secret_access_audit (
            user_id, operation, secret_type, success, failure_reason, metadata
        ) VALUES (
            requesting_user_id, operation, secret_type, false, 'UNAUTHORIZED_ACCESS_ATTEMPT',
            jsonb_build_object('attempted_target_user', target_user_id)
        );
        RETURN false;
    END IF;
    
    -- Enhanced rate limiting for secret access
    SELECT check_rate_limit(
        requesting_user_id::text,
        'secret_access_' || secret_type,
        5,  -- max 5 secret access requests
        1   -- per minute
    ) INTO rate_limit_result;
    
    IF (rate_limit_result ->> 'is_blocked')::boolean THEN
        -- Log rate limit violation
        INSERT INTO secret_access_audit (
            user_id, operation, secret_type, success, failure_reason, metadata
        ) VALUES (
            requesting_user_id, operation, secret_type, false, 'RATE_LIMITED',
            jsonb_build_object('rate_limit_info', rate_limit_result)
        );
        RETURN false;
    END IF;
    
    -- Check 2FA requirement for high-security operations
    SELECT two_factor_enabled INTO user_2fa_enabled
    FROM profiles
    WHERE user_id = requesting_user_id;
    
    -- For critical operations, log if 2FA is not enabled (but still allow access)
    IF operation IN ('READ', 'UPDATE') AND secret_type = 'trading_key' AND NOT COALESCE(user_2fa_enabled, false) THEN
        INSERT INTO secret_access_audit (
            user_id, operation, secret_type, success, failure_reason, metadata
        ) VALUES (
            requesting_user_id, operation, secret_type, true, '2FA_NOT_ENABLED',
            jsonb_build_object('operation', operation, 'secret_type', secret_type, 'warning', 'recommend_2fa')
        );
    ELSE
        -- Log successful access validation
        INSERT INTO secret_access_audit (
            user_id, operation, secret_type, success, metadata
        ) VALUES (
            requesting_user_id, operation, secret_type, true,
            jsonb_build_object('validation_passed', true)
        );
    END IF;
    
    RETURN true;
END;
$$;

-- Update the get_user_secrets_secure function
CREATE OR REPLACE FUNCTION public.get_user_secrets_secure(user_id_param uuid)
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
    -- Validate access with enhanced security
    IF NOT validate_secret_access_enhanced(auth.uid(), user_id_param, 'READ', 'all_secrets') THEN
        RAISE EXCEPTION 'Access denied to user secrets';
    END IF;
    
    -- Return decrypted secrets
    RETURN QUERY
    SELECT 
        us.id,
        us.user_id,
        us.rpc_url, -- RPC URL is not encrypted as it's less sensitive
        decrypt_secret_secure(us.trading_private_key) as trading_private_key,
        CASE 
            WHEN us.function_token IS NOT NULL 
            THEN decrypt_secret_secure(us.function_token) 
            ELSE NULL 
        END as function_token,
        us.created_at,
        us.updated_at
    FROM user_secrets us
    WHERE us.user_id = user_id_param;
END;
$$;

-- Add comments for the corrected views
COMMENT ON VIEW public.user_security_audit IS 'User view of their own security audit events. RLS enforced through WHERE clause.';
COMMENT ON VIEW public.security_summary IS 'Security summary for current user only. Shows encryption status and audit statistics.';

-- Final verification that all our important tables have RLS enabled
DO $$
DECLARE
    table_without_rls text;
BEGIN
    SELECT tablename INTO table_without_rls
    FROM pg_tables t
    LEFT JOIN pg_class c ON c.relname = t.tablename
    WHERE t.schemaname = 'public'
    AND t.tablename IN ('user_secrets', 'secret_access_audit', 'secret_encryption_keys', 'profiles', 'blackbox_users')
    AND (c.relrowsecurity IS NULL OR c.relrowsecurity = false)
    LIMIT 1;
    
    IF table_without_rls IS NOT NULL THEN
        RAISE NOTICE 'Warning: Table % does not have RLS enabled', table_without_rls;
    ELSE
        RAISE NOTICE 'All security-critical tables have RLS enabled';
    END IF;
END;
$$;