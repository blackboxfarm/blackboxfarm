-- Fix security definer views by recreating them without SECURITY DEFINER
-- This ensures they use the querying user's permissions instead of the creator's

-- Drop existing views first
DROP VIEW IF EXISTS public.security_summary;
DROP VIEW IF EXISTS public.user_security_audit;

-- Recreate security_summary view without SECURITY DEFINER
CREATE VIEW public.security_summary AS
SELECT 
    'user_secrets'::text AS table_name,
    count(*) AS total_records,
    count(
        CASE
            WHEN (user_secrets.trading_private_key IS NOT NULL) THEN 1
            ELSE NULL::integer
        END) AS encrypted_keys,
    count(
        CASE
            WHEN (user_secrets.function_token IS NOT NULL) THEN 1
            ELSE NULL::integer
        END) AS encrypted_tokens
FROM user_secrets
WHERE (user_secrets.user_id = auth.uid())
UNION ALL
SELECT 
    'secret_access_audit'::text AS table_name,
    count(*) AS total_records,
    count(
        CASE
            WHEN (secret_access_audit.success = false) THEN 1
            ELSE NULL::integer
        END) AS encrypted_keys,
    count(
        CASE
            WHEN (secret_access_audit.success = true) THEN 1
            ELSE NULL::integer
        END) AS encrypted_tokens
FROM secret_access_audit
WHERE (secret_access_audit.user_id = auth.uid());

-- Recreate user_security_audit view without SECURITY DEFINER
CREATE VIEW public.user_security_audit AS
SELECT 
    id,
    operation,
    secret_type,
    access_timestamp,
    success,
    CASE
        WHEN (success = false) THEN failure_reason
        ELSE 'SUCCESS'::text
    END AS result,
    CASE
        WHEN (metadata ? 'validation_passed'::text) THEN jsonb_build_object('status', 'validated')
        WHEN (metadata ? 'rate_limit_info'::text) THEN jsonb_build_object('status', 'rate_limited')
        ELSE jsonb_build_object('status', 'unknown')
    END AS summary
FROM secret_access_audit
WHERE (user_id = auth.uid());

-- Add RLS policies to ensure proper access control
ALTER VIEW public.security_summary SET (security_invoker = true);
ALTER VIEW public.user_security_audit SET (security_invoker = true);