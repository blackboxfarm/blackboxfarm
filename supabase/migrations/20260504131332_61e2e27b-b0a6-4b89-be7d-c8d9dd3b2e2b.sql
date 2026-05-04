-- Drop the overly permissive public-ALL policy
DROP POLICY IF EXISTS "Allow service role full access on holders_intel_config" ON public.holders_intel_config;

-- Public read remains open (config drives client-side feature flags)
CREATE POLICY "Public can read holders intel config"
ON public.holders_intel_config
FOR SELECT
TO anon, authenticated
USING (true);

-- Service role: full write access
CREATE POLICY "Service role can insert holders intel config"
ON public.holders_intel_config
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update holders intel config"
ON public.holders_intel_config
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can delete holders intel config"
ON public.holders_intel_config
FOR DELETE
TO service_role
USING (true);

-- Super admins: write access via admin UI
CREATE POLICY "Super admins can insert holders intel config"
ON public.holders_intel_config
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update holders intel config"
ON public.holders_intel_config
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete holders intel config"
ON public.holders_intel_config
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));