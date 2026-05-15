-- Allow admins/super_admins to update intelligence_feature_flags
-- (Previously only service_role could write, so the SMS toggle UI silently no-op'd)
CREATE POLICY "Admins can update feature flags"
ON public.intelligence_feature_flags
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));