
DROP POLICY IF EXISTS "Users view own profile or admin views all" ON public.profiles;

CREATE POLICY "Users view own profile or admin views all"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (auth.uid() = user_id)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);
