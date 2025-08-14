-- Add explicit restrictive policies to prevent future misconfigurations
-- This makes the security intent clear and prevents accidental exposure

-- Policy that explicitly denies all direct SELECT access
CREATE POLICY "Block direct password access" 
ON public.access_passwords 
FOR SELECT 
USING (false);

-- Policy that explicitly denies all INSERT access
CREATE POLICY "Block password inserts" 
ON public.access_passwords 
FOR INSERT 
WITH CHECK (false);

-- Policy that explicitly denies all UPDATE access
CREATE POLICY "Block password updates" 
ON public.access_passwords 
FOR UPDATE 
USING (false);

-- Policy that explicitly denies all DELETE access
CREATE POLICY "Block password deletes" 
ON public.access_passwords 
FOR DELETE 
USING (false);

-- Optional: If you need admin access in the future, you can replace the SELECT policy with:
-- CREATE POLICY "Admin only password access" 
-- ON public.access_passwords 
-- FOR SELECT 
-- USING (auth.jwt() ->> 'role' = 'service_role');

-- The secure function verify_access_password() uses SECURITY DEFINER
-- which bypasses RLS, so authentication continues to work normally