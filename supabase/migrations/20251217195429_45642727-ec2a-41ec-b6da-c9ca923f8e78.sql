-- Fix RLS policies on advertiser_accounts to prevent wallet secret exposure
-- Drop existing policies
DROP POLICY IF EXISTS "Super admins can manage all advertiser accounts" ON public.advertiser_accounts;
DROP POLICY IF EXISTS "Users can view their own advertiser account" ON public.advertiser_accounts;
DROP POLICY IF EXISTS "Users can create their own advertiser account" ON public.advertiser_accounts;
DROP POLICY IF EXISTS "Users can update their own advertiser account" ON public.advertiser_accounts;

-- Create restrictive policies that ensure users can ONLY access their own data
-- SELECT: Users can only view their own account, super admins can view all
CREATE POLICY "Users can view own advertiser account"
ON public.advertiser_accounts
FOR SELECT
USING (auth.uid() = user_id OR is_super_admin(auth.uid()));

-- INSERT: Users can only create their own account
CREATE POLICY "Users can create own advertiser account"
ON public.advertiser_accounts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own account
CREATE POLICY "Users can update own advertiser account"
ON public.advertiser_accounts
FOR UPDATE
USING (auth.uid() = user_id);

-- DELETE: Only super admins can delete accounts
CREATE POLICY "Super admins can delete advertiser accounts"
ON public.advertiser_accounts
FOR DELETE
USING (is_super_admin(auth.uid()));