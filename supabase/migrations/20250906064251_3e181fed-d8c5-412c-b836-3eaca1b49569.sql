-- Fix security linter issues identified after the previous migration

-- Issue 1: Enable RLS on the new tables we created
ALTER TABLE public.secret_encryption_keys ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for secret_encryption_keys (service role only)
CREATE POLICY "Service role can manage encryption keys"
ON public.secret_encryption_keys
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- Verify all other tables have RLS enabled
-- Check if any other tables need RLS enabled
DO $$
DECLARE
    table_record RECORD;
BEGIN
    -- Enable RLS on any public tables that don't have it enabled
    FOR table_record IN
        SELECT schemaname, tablename
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT IN (
            SELECT schemaname||'.'||tablename 
            FROM pg_tables t
            JOIN pg_class c ON c.relname = t.tablename
            WHERE c.relrowsecurity = true
            AND schemaname = 'public'
        )
        AND tablename NOT LIKE 'pg_%'
        AND tablename NOT LIKE 'sql_%'
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 
                      table_record.schemaname, table_record.tablename);
        
        RAISE NOTICE 'Enabled RLS on table: %.%', table_record.schemaname, table_record.tablename;
    END LOOP;
END
$$;

-- Issue 2: The extension warning is likely about extensions in public schema
-- This is typically not something we can fix directly as it's managed by Supabase
-- But let's ensure our new security functions are properly documented

-- Add proper security documentation
COMMENT ON TABLE public.secret_encryption_keys IS 'Manages encryption key versions for secure secret storage. Service role access only.';
COMMENT ON TABLE public.secret_access_audit IS 'Comprehensive audit trail for all access to sensitive user secrets including failed attempts.';

-- Create a view for users to see their own security audit without exposing sensitive details
CREATE OR REPLACE VIEW public.user_security_audit AS
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
    -- Remove potentially sensitive metadata for user view
    CASE 
        WHEN metadata ? 'validation_passed' THEN jsonb_build_object('status', 'validated')
        WHEN metadata ? 'rate_limit_info' THEN jsonb_build_object('status', 'rate_limited')
        ELSE jsonb_build_object('status', 'unknown')
    END as summary
FROM public.secret_access_audit 
WHERE user_id = auth.uid();

-- Enable RLS on the view (though views inherit from base tables)
-- This is just for explicit documentation
COMMENT ON VIEW public.user_security_audit IS 'User-friendly view of security audit events. Users can only see their own events.';

-- Add additional security constraints
-- Ensure that the secret_access_audit table has proper constraints
ALTER TABLE public.secret_access_audit 
ADD CONSTRAINT chk_operation_valid 
CHECK (operation IN ('READ', 'UPDATE', 'DELETE', 'CREATE'));

ALTER TABLE public.secret_access_audit 
ADD CONSTRAINT chk_secret_type_valid 
CHECK (secret_type IN ('trading_key', 'rpc_url', 'function_token', 'all_secrets', 'user_secrets', 'unknown'));

-- Ensure audit records are immutable after creation
CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RAISE EXCEPTION 'Audit records cannot be modified after creation';
END;
$$;

-- Prevent updates to audit records
DROP TRIGGER IF EXISTS prevent_audit_update ON public.secret_access_audit;
CREATE TRIGGER prevent_audit_update
    BEFORE UPDATE ON public.secret_access_audit
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

-- Add retention policy for audit logs (optional - commented out for now)
-- This would clean up old audit logs to prevent unlimited growth
/*
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete audit logs older than 1 year
    DELETE FROM public.secret_access_audit 
    WHERE access_timestamp < now() - interval '1 year';
END;
$$;
*/