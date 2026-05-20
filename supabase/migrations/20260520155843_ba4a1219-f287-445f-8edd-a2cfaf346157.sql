CREATE POLICY "Super admins can read social_posts_log"
ON public.social_posts_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can insert social_posts_log"
ON public.social_posts_log
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update social_posts_log"
ON public.social_posts_log
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete social_posts_log"
ON public.social_posts_log
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));