-- Fix Security Linter Issues: Remove SECURITY DEFINER from view and fix function search paths

-- 1. Drop and recreate the view without SECURITY DEFINER
DROP VIEW IF EXISTS public.safe_user_profiles;

CREATE VIEW public.safe_user_profiles AS
SELECT 
    id,
    user_id,
    display_name,
    avatar_url,
    email_verified,
    phone_verified,
    two_factor_enabled,
    created_at,
    updated_at
FROM public.profiles;

-- Grant access to the safe view
GRANT SELECT ON public.safe_user_profiles TO authenticated;

-- 2. Fix function search paths by adding SET search_path where missing
CREATE OR REPLACE FUNCTION public.mask_sensitive_data(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Mask private keys and secrets in logs
    IF length(input_text) > 10 THEN
        RETURN left(input_text, 4) || '****' || right(input_text, 4);
    ELSE
        RETURN '****';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_secret_access(
    requesting_user_id UUID,
    target_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;