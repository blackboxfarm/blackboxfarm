-- Fix critical security issues with RLS policies

-- First, ensure RLS is enabled on all sensitive tables
ALTER TABLE public.user_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackbox_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackbox_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_sessions ENABLE ROW LEVEL SECURITY;

-- Drop and recreate the problematic wallet_pools policy
DROP POLICY IF EXISTS "Users can manage their own wallets" ON public.wallet_pools;

-- Create secure wallet_pools policy that REQUIRES authentication and user ownership
CREATE POLICY "Users can only access their own wallets"
ON public.wallet_pools
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND user_id IS NOT NULL)
WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

-- Ensure user_secrets policy is restrictive to authenticated users only
DROP POLICY IF EXISTS "Users can manage their own secrets" ON public.user_secrets;

CREATE POLICY "Authenticated users can only manage their own secrets"
ON public.user_secrets
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Secure blackbox_wallets - only allow access through campaign ownership
DROP POLICY IF EXISTS "Users can view wallets from their campaigns" ON public.blackbox_wallets;

CREATE POLICY "Users can only access wallets from their own campaigns"
ON public.blackbox_wallets
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM blackbox_campaigns 
  WHERE blackbox_campaigns.id = blackbox_wallets.campaign_id 
  AND blackbox_campaigns.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM blackbox_campaigns 
  WHERE blackbox_campaigns.id = blackbox_wallets.campaign_id 
  AND blackbox_campaigns.user_id = auth.uid()
));

-- Secure blackbox_users table
DROP POLICY IF EXISTS "Users can manage their blackbox profile" ON public.blackbox_users;

CREATE POLICY "Users can only manage their own blackbox profile"
ON public.blackbox_users
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Secure trading_positions
DROP POLICY IF EXISTS "Users can manage their positions" ON public.trading_positions;

CREATE POLICY "Users can only manage their own trading positions"
ON public.trading_positions
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM trading_sessions 
  WHERE trading_sessions.id = trading_positions.session_id 
  AND trading_sessions.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM trading_sessions 
  WHERE trading_sessions.id = trading_positions.session_id 
  AND trading_sessions.user_id = auth.uid()
));

-- Secure trade_history
DROP POLICY IF EXISTS "Users can view their trade history" ON public.trade_history;

CREATE POLICY "Users can only view their own trade history"
ON public.trade_history
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM trading_sessions 
  WHERE trading_sessions.id = trade_history.session_id 
  AND trading_sessions.user_id = auth.uid()
));

-- Secure trading_sessions
DROP POLICY IF EXISTS "Users can manage their trading sessions" ON public.trading_sessions;

CREATE POLICY "Users can only manage their own trading sessions"
ON public.trading_sessions
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add a constraint to prevent NULL user_id in sensitive tables
ALTER TABLE public.wallet_pools ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.user_secrets ALTER COLUMN user_id SET NOT NULL;