-- Update RLS policy for wallet_pools to allow user-specific wallet management
-- Remove the restrictive session-based policy and replace with user-based access

DROP POLICY IF EXISTS "Users can manage their wallet pools" ON public.wallet_pools;

-- Create new policy that allows users to manage their own wallets
-- We'll use a user_id column to associate wallets with users
ALTER TABLE public.wallet_pools 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create policy for user-specific wallet access
CREATE POLICY "Users can manage their own wallets" 
ON public.wallet_pools 
FOR ALL 
USING (auth.uid() = user_id OR user_id IS NULL) 
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Set user_id for existing records (if any) - they will be accessible to all users during transition
-- In production, you might want to handle this differently