
DROP POLICY IF EXISTS "Super admins can update health mode" ON public.platform_health_mode;
DROP POLICY IF EXISTS "Super admins can insert health mode" ON public.platform_health_mode;

CREATE POLICY "Super admins can update health mode"
ON public.platform_health_mode FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert health mode"
ON public.platform_health_mode FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));
