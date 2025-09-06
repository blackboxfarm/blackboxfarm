-- Update RLS policy for blackbox_command_codes to allow creating unassigned commands
DROP POLICY IF EXISTS "Users can manage their command codes" ON public.blackbox_command_codes;

-- Create new policy that allows:
-- 1. Managing commands assigned to wallets they own (existing behavior)
-- 2. Creating/managing unassigned commands (wallet_id IS NULL) that they created
CREATE POLICY "Users can manage their command codes" 
ON public.blackbox_command_codes 
FOR ALL 
USING (
  -- Allow if command is assigned to a wallet owned by user
  (wallet_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM blackbox_wallets bw
    JOIN campaign_wallets cw ON cw.wallet_id = bw.id
    JOIN blackbox_campaigns bc ON bc.id = cw.campaign_id
    WHERE bw.id = blackbox_command_codes.wallet_id 
    AND bc.user_id = auth.uid()
  ))
  OR
  -- Allow if command is unassigned and user created it
  (wallet_id IS NULL AND user_id = auth.uid())
);

-- Add user_id column to track who created unassigned commands
ALTER TABLE public.blackbox_command_codes 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);