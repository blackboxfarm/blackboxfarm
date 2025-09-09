-- Fix the overly restrictive RLS policy on user_secrets
-- The current policy is calling validate_secret_access_enhanced which might be too strict

DROP POLICY IF EXISTS "Enhanced secure access to own secrets" ON user_secrets;

-- Create a simpler, more reliable policy that still maintains security
CREATE POLICY "Users can access their own secrets" ON user_secrets
FOR ALL
USING (auth.uid() IS NOT NULL AND user_id = auth.uid())
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Also fix the wallet_pools policy to ensure it works properly
DROP POLICY IF EXISTS "Users can manage their own wallet pools" ON wallet_pools;

CREATE POLICY "Users can manage their own wallet pools" ON wallet_pools
FOR ALL
USING (auth.uid() IS NOT NULL AND user_id = auth.uid())
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());