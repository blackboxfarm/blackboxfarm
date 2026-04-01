-- Fix RLS policies: change 'admin' to 'super_admin' to match actual role
DROP POLICY IF EXISTS "Super admins can read all briefings" ON public.intel_briefings;
DROP POLICY IF EXISTS "Super admins can insert briefings" ON public.intel_briefings;
DROP POLICY IF EXISTS "Super admins can update briefings" ON public.intel_briefings;
DROP POLICY IF EXISTS "Super admins can delete briefings" ON public.intel_briefings;

CREATE POLICY "Super admins can read all briefings"
  ON public.intel_briefings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert briefings"
  ON public.intel_briefings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update briefings"
  ON public.intel_briefings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete briefings"
  ON public.intel_briefings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Also fix intel_briefing_revisions
DROP POLICY IF EXISTS "Super admins can read revisions" ON public.intel_briefing_revisions;
DROP POLICY IF EXISTS "Super admins can insert revisions" ON public.intel_briefing_revisions;

CREATE POLICY "Super admins can read revisions"
  ON public.intel_briefing_revisions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert revisions"
  ON public.intel_briefing_revisions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));