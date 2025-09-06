-- Add user_id column to blackbox_command_codes table
ALTER TABLE public.blackbox_command_codes 
ADD COLUMN user_id UUID;

-- Add foreign key reference to auth.users
ALTER TABLE public.blackbox_command_codes 
ADD CONSTRAINT blackbox_command_codes_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- Update existing records to set user_id based on wallet ownership
UPDATE public.blackbox_command_codes 
SET user_id = (
  SELECT bc.user_id 
  FROM blackbox_wallets bw
  JOIN campaign_wallets cw ON cw.wallet_id = bw.id
  JOIN blackbox_campaigns bc ON bc.id = cw.campaign_id
  WHERE bw.id = blackbox_command_codes.wallet_id
)
WHERE wallet_id IS NOT NULL;

-- Drop and recreate the RLS policy
DROP POLICY IF EXISTS "Users can manage their command codes" ON public.blackbox_command_codes;

CREATE POLICY "Users can manage their command codes" 
ON public.blackbox_command_codes 
FOR ALL 
USING (
  auth.uid() IS NOT NULL AND (
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
  )
);