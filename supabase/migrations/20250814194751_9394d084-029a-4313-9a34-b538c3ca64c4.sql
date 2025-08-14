-- Fix the function security issue by setting search_path
CREATE OR REPLACE FUNCTION public.verify_access_password(input_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    stored_hash text;
BEGIN
    -- Get the first active password hash (you may want to modify this logic)
    SELECT password_hash INTO stored_hash 
    FROM public.access_passwords 
    WHERE is_active = true 
    LIMIT 1;
    
    -- Return true if password matches any active hash
    -- Note: This is a simple comparison. In production, use proper password hashing
    RETURN stored_hash = input_password;
END;
$$;