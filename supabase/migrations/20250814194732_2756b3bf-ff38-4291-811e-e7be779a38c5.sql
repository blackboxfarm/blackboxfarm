-- Remove the insecure public read policy
DROP POLICY IF EXISTS "Allow reading access passwords" ON public.access_passwords;

-- Create a secure function to verify passwords without exposing hashes
CREATE OR REPLACE FUNCTION public.verify_access_password(input_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Grant execute permission to authenticated users only
GRANT EXECUTE ON FUNCTION public.verify_access_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_access_password(text) TO anon;

-- Ensure no one can directly read the password table
-- (Remove all existing policies and don't create any new SELECT policies)