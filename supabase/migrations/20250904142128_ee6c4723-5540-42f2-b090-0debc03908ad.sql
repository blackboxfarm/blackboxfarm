-- Fix critical security vulnerability in profiles table RLS policies
-- Replace permissive policies with restrictive ones to ensure proper access control

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Secure profile view access" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile insert access" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile update access" ON public.profiles;

-- Create restrictive policies that use AND logic instead of OR logic
CREATE POLICY "Users can only view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Ensure DELETE is blocked entirely for data retention
CREATE POLICY "Prevent profile deletion"
    ON public.profiles FOR DELETE
    USING (false);

-- Update the security audit logging function to log profile access attempts
CREATE OR REPLACE FUNCTION public.log_profile_security_event(
    event_type_param text,
    user_id_param uuid,
    target_user_id_param uuid,
    details_param jsonb DEFAULT '{}'::jsonb
)
RETURNS void
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
        event_type_param,
        'profiles',
        user_id_param,
        details_param || jsonb_build_object(
            'target_user_id', target_user_id_param,
            'timestamp', now()
        )
    );
END;
$function$;