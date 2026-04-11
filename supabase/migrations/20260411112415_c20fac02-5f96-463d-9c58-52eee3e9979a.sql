-- Allow super_admins to read token_vigil from client side
-- The existing ALL policy uses has_role which should work, but let's ensure a SELECT policy exists
CREATE POLICY "Super admins can read vigil"
ON public.token_vigil
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Also add a read policy for token_social_links for super admins
CREATE POLICY "Super admins can read social links"
ON public.token_social_links
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));