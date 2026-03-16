DROP POLICY "Super admins can read morning reports" ON public.morning_reports;

CREATE POLICY "Super admins can read morning reports"
ON public.morning_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));