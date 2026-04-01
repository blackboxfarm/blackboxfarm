-- Allow anyone (including anon) to read public-facing system settings
CREATE POLICY "Public can read public settings"
ON public.system_settings
FOR SELECT
TO anon, authenticated
USING (key IN ('intel_briefings_public'));