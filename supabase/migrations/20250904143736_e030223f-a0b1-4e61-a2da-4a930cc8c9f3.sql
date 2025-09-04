-- Enhanced security for profiles table: Fix policy conflicts and add comprehensive protection
-- This addresses the security finding about potential phone number and 2FA secret exposure

-- Drop all existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Enhanced profile view access" ON public.profiles;
DROP POLICY IF EXISTS "Enhanced profile insert access" ON public.profiles;  
DROP POLICY IF EXISTS "Enhanced profile update access" ON public.profiles;
DROP POLICY IF EXISTS "Users can only view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can only update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can only insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Prevent profile deletion" ON public.profiles;

-- Ensure the encryption trigger exists for automatic encryption
DROP TRIGGER IF EXISTS encrypt_profile_secrets_trigger ON public.profiles;

CREATE TRIGGER encrypt_profile_secrets_trigger
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.encrypt_profile_secrets();

-- Create a function to validate profile access attempts with rate limiting
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
        RETURN false;
    END IF;
    
    -- Only allow access to own profile
    IF current_user_id != target_user_id THEN
        RETURN false;
    END IF;
    
    -- Check rate limiting for profile access
    SELECT public.check_rate_limit(
        current_user_id::text,
        'profile_access',
        20, -- max 20 requests per minute
        1   
    ) INTO rate_limit_result;
    
    -- Block if rate limited
    IF (rate_limit_result ->> 'is_blocked')::boolean THEN
        RETURN false;
    END IF;
    
    RETURN true;
END;
$function$;

-- Create enhanced restrictive RLS policies
CREATE POLICY "Secure profile view access"
    ON public.profiles FOR SELECT
    USING (public.validate_profile_access(user_id));

CREATE POLICY "Secure profile insert access"
    ON public.profiles FOR INSERT
    WITH CHECK (public.validate_profile_access(user_id));

CREATE POLICY "Secure profile update access"
    ON public.profiles FOR UPDATE
    USING (public.validate_profile_access(user_id))
    WITH CHECK (public.validate_profile_access(user_id));

-- Prevent profile deletion entirely
CREATE POLICY "Block profile deletion"
    ON public.profiles FOR DELETE
    USING (false);

-- Create a secure function for accessing profile data with masked sensitive fields
CREATE OR REPLACE FUNCTION public.get_user_profile_safe(requesting_user_id uuid)
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
    -- Validate access
    IF NOT public.validate_profile_access(requesting_user_id) THEN
        RAISE EXCEPTION 'Access denied to profile data';
    END IF;
    
    -- Return profile data with masked phone number
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
                    WHEN length(public.decrypt_user_secret(p.phone_number)) > 4 THEN
                        '***-***-' || right(public.decrypt_user_secret(p.phone_number), 4)
                    ELSE '***-***-****'
                END
            ELSE NULL
        END as phone_number_masked,
        (p.two_factor_secret IS NOT NULL) as has_two_factor
    FROM public.profiles p
    WHERE p.user_id = requesting_user_id;
END;
$function$;