-- Enhanced security for profiles table: Add field-level encryption for sensitive data
-- This addresses the security finding about potential phone number and 2FA secret exposure

-- First, ensure the existing encryption triggers are properly set up for profiles table
-- The encrypt_profile_secrets function should handle phone numbers and 2FA secrets

-- Verify the encryption trigger exists and is working
DROP TRIGGER IF EXISTS encrypt_profile_secrets_trigger ON public.profiles;

CREATE TRIGGER encrypt_profile_secrets_trigger
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.encrypt_profile_secrets();

-- Add additional security measures: rate limiting for profile access
-- Create a function to validate profile access attempts
CREATE OR REPLACE FUNCTION public.validate_profile_access(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    current_user_id uuid;
    rate_limit_result jsonb;
BEGIN
    -- Get current user
    current_user_id := auth.uid();
    
    -- Block if no authenticated user
    IF current_user_id IS NULL THEN
        -- Log unauthorized access attempt
        PERFORM public.log_profile_security_event(
            'UNAUTHORIZED_ACCESS_NO_AUTH',
            NULL,
            target_user_id,
            jsonb_build_object('timestamp', now(), 'blocked', true)
        );
        RETURN false;
    END IF;
    
    -- Only allow access to own profile
    IF current_user_id != target_user_id THEN
        -- Log unauthorized access attempt
        PERFORM public.log_profile_security_event(
            'UNAUTHORIZED_CROSS_USER_ACCESS',
            current_user_id,
            target_user_id,
            jsonb_build_object('timestamp', now(), 'blocked', true)
        );
        RETURN false;
    END IF;
    
    -- Check rate limiting for profile access
    SELECT public.check_rate_limit(
        current_user_id::text,
        'profile_access',
        20, -- max 20 requests
        1   -- per minute
    ) INTO rate_limit_result;
    
    IF (rate_limit_result ->> 'is_blocked')::boolean THEN
        PERFORM public.log_profile_security_event(
            'RATE_LIMIT_EXCEEDED',
            current_user_id,
            target_user_id,
            rate_limit_result
        );
        RETURN false;
    END IF;
    
    -- Log successful access
    PERFORM public.log_profile_security_event(
        'PROFILE_ACCESS_GRANTED',
        current_user_id,
        target_user_id,
        jsonb_build_object('timestamp', now())
    );
    
    RETURN true;
END;
$function$;

-- Update RLS policies to use the validation function for additional security
DROP POLICY IF EXISTS "Users can only view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can only update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can only insert their own profile" ON public.profiles;

-- Create enhanced restrictive policies with additional validation
CREATE POLICY "Enhanced profile view access"
    ON public.profiles FOR SELECT
    USING (public.validate_profile_access(user_id));

CREATE POLICY "Enhanced profile insert access"
    ON public.profiles FOR INSERT
    WITH CHECK (public.validate_profile_access(user_id));

CREATE POLICY "Enhanced profile update access"
    ON public.profiles FOR UPDATE
    USING (public.validate_profile_access(user_id))
    WITH CHECK (public.validate_profile_access(user_id));

-- Create a secure function for accessing decrypted profile data
-- This ensures sensitive data is only accessible through controlled functions
CREATE OR REPLACE FUNCTION public.get_user_profile_secure(requesting_user_id uuid)
RETURNS TABLE(
    id uuid,
    user_id uuid,
    two_factor_enabled boolean,
    email_verified boolean,
    phone_verified boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    display_name text,
    avatar_url text,
    phone_number_masked text,
    has_two_factor boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Validate access first
    IF NOT public.validate_profile_access(requesting_user_id) THEN
        RAISE EXCEPTION 'Access denied to profile data';
    END IF;
    
    -- Return profile data with masked sensitive information
    RETURN QUERY
    SELECT 
        p.id,
        p.user_id,
        p.two_factor_enabled,
        p.email_verified,
        p.phone_verified,
        p.created_at,
        p.updated_at,
        p.display_name,
        p.avatar_url,
        CASE 
            WHEN p.phone_number IS NOT NULL THEN 
                CASE 
                    WHEN length(convert_from(decode(p.phone_number, 'base64'), 'UTF8')) > 4 THEN
                        '***-***-' || right(convert_from(decode(p.phone_number, 'base64'), 'UTF8'), 4)
                    ELSE '***-***-****'
                END
            ELSE NULL
        END as phone_number_masked,
        (p.two_factor_secret IS NOT NULL) as has_two_factor
    FROM public.profiles p
    WHERE p.user_id = requesting_user_id;
END;
$function$;