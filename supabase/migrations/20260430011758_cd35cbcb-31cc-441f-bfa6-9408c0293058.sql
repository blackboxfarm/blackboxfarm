
-- Grant super_admin full access to autopsy_candidates
DROP POLICY IF EXISTS autopsy_candidates_admin_all ON public.autopsy_candidates;

CREATE POLICY autopsy_candidates_admin_all
  ON public.autopsy_candidates
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Grant super_admin full access to autopsy_reports
DROP POLICY IF EXISTS autopsy_reports_admin_write ON public.autopsy_reports;
DROP POLICY IF EXISTS autopsy_reports_admin_update ON public.autopsy_reports;
DROP POLICY IF EXISTS autopsy_reports_admin_delete ON public.autopsy_reports;

CREATE POLICY autopsy_reports_admin_write
  ON public.autopsy_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY autopsy_reports_admin_update
  ON public.autopsy_reports
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY autopsy_reports_admin_delete
  ON public.autopsy_reports
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
