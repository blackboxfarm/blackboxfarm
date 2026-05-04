-- Drop the overly permissive public-ALL policy
DROP POLICY IF EXISTS "Allow service role full access on registry" ON public.edge_function_registry;

-- Public read remains open (registry is non-sensitive metadata)
CREATE POLICY "Public can read edge function registry"
ON public.edge_function_registry
FOR SELECT
TO anon, authenticated
USING (true);

-- Service role: full write access (edge functions / orchestrator)
CREATE POLICY "Service role can insert edge function registry"
ON public.edge_function_registry
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update edge function registry"
ON public.edge_function_registry
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can delete edge function registry"
ON public.edge_function_registry
FOR DELETE
TO service_role
USING (true);

-- Super admins: write access via admin UI (uses authenticated role + has_role check)
CREATE POLICY "Super admins can insert edge function registry"
ON public.edge_function_registry
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update edge function registry"
ON public.edge_function_registry
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete edge function registry"
ON public.edge_function_registry
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));