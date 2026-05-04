-- Drop the overly permissive policy that allowed any role (including anon) full access
DROP POLICY IF EXISTS "Service role full access" ON public.token_social_links;

-- Keep SELECT open (data is public threat intelligence)
CREATE POLICY "Public can read token social links"
ON public.token_social_links
FOR SELECT
TO anon, authenticated
USING (true);

-- Restrict all writes to service_role only (edge functions use service role internally)
CREATE POLICY "Service role can insert token social links"
ON public.token_social_links
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update token social links"
ON public.token_social_links
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can delete token social links"
ON public.token_social_links
FOR DELETE
TO service_role
USING (true);