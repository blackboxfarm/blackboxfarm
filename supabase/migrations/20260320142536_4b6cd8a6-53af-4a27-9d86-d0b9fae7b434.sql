
-- =====================================================
-- Tier 2 Security Fix: RLS Always-True Policies
-- =====================================================

-- Fix 1: token_assessments — ALL to public is dangerous
-- Replace with super_admin-only access
DROP POLICY IF EXISTS "Service role full access" ON public.token_assessments;
CREATE POLICY "Super admins can manage token_assessments" ON public.token_assessments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Fix 2: token_early_warnings — ALL to public is dangerous
DROP POLICY IF EXISTS "Service role can manage warnings" ON public.token_early_warnings;
CREATE POLICY "Super admins can manage token_early_warnings" ON public.token_early_warnings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Fix 3: token_pattern_rules — ALL to public is dangerous
DROP POLICY IF EXISTS "Service role full access on token_pattern_rules" ON public.token_pattern_rules;
CREATE POLICY "Super admins can manage token_pattern_rules" ON public.token_pattern_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Fix 4: morning_reports — INSERT to public should be restricted
DROP POLICY IF EXISTS "Service can insert morning reports" ON public.morning_reports;
CREATE POLICY "Super admins can insert morning reports" ON public.morning_reports
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- =====================================================
-- REVERSAL SQL (save for reference):
-- DROP POLICY "Super admins can manage token_assessments" ON public.token_assessments;
-- CREATE POLICY "Service role full access" ON public.token_assessments FOR ALL TO public USING (true) WITH CHECK (true);
-- DROP POLICY "Super admins can manage token_early_warnings" ON public.token_early_warnings;
-- CREATE POLICY "Service role can manage warnings" ON public.token_early_warnings FOR ALL TO public USING (true) WITH CHECK (true);
-- DROP POLICY "Super admins can manage token_pattern_rules" ON public.token_pattern_rules;
-- CREATE POLICY "Service role full access on token_pattern_rules" ON public.token_pattern_rules FOR ALL TO public USING (true) WITH CHECK (true);
-- DROP POLICY "Super admins can insert morning reports" ON public.morning_reports;
-- CREATE POLICY "Service can insert morning reports" ON public.morning_reports FOR INSERT TO public WITH CHECK (true);
-- =====================================================
