-- Fix testimonials RLS: check super_admin instead of admin
DROP POLICY IF EXISTS "Super admins full access to testimonials" ON public.testimonials;
CREATE POLICY "Super admins full access to testimonials"
  ON public.testimonials FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Fix testimonial_invites RLS
DROP POLICY IF EXISTS "Super admins manage invites" ON public.testimonial_invites;
CREATE POLICY "Super admins manage invites"
  ON public.testimonial_invites FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
