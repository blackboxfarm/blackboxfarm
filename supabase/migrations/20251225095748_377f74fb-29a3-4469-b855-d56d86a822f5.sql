-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Super admin wallets access" ON public.super_admin_wallets;

-- Create policies that allow super admins to access wallets
-- Read access for authenticated users who are super admins
CREATE POLICY "Super admins can read wallets" 
ON public.super_admin_wallets 
FOR SELECT 
USING (
  auth.uid() IN (
    SELECT user_id FROM user_roles WHERE role IN ('super_admin', 'admin')
  )
);

-- Write access for super admins
CREATE POLICY "Super admins can manage wallets" 
ON public.super_admin_wallets 
FOR ALL 
USING (
  auth.uid() IN (
    SELECT user_id FROM user_roles WHERE role IN ('super_admin', 'admin')
  )
);

-- Service role always has access
CREATE POLICY "Service role full access on wallets" 
ON public.super_admin_wallets 
FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);