-- Fix wallet_pools RLS policy to allow proper user access
DROP POLICY IF EXISTS "Secure wallet pools access" ON public.wallet_pools;

CREATE POLICY "Users can manage their own wallet pools" 
ON public.wallet_pools 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);