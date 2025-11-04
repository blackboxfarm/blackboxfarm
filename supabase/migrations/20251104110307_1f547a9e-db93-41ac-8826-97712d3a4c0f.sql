-- Fix RLS policies for scraped_tokens table to allow super admin access
DROP POLICY IF EXISTS "Super admins can manage scraped tokens" ON scraped_tokens;

CREATE POLICY "Super admins can manage scraped tokens"
ON scraped_tokens
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));