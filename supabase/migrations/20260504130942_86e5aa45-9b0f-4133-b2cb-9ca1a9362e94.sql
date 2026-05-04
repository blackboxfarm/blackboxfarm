-- Drop the overly permissive public-ALL policy
DROP POLICY IF EXISTS "Service role full access to welcome config" ON public.telegram_channel_welcome_config;

-- Public read remains open
CREATE POLICY "Public can read welcome config"
ON public.telegram_channel_welcome_config
FOR SELECT
TO anon, authenticated
USING (true);

-- Service role: full write access
CREATE POLICY "Service role can insert welcome config"
ON public.telegram_channel_welcome_config
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update welcome config"
ON public.telegram_channel_welcome_config
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can delete welcome config"
ON public.telegram_channel_welcome_config
FOR DELETE
TO service_role
USING (true);

-- Super admins: write access via admin UI
CREATE POLICY "Super admins can insert welcome config"
ON public.telegram_channel_welcome_config
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update welcome config"
ON public.telegram_channel_welcome_config
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete welcome config"
ON public.telegram_channel_welcome_config
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));