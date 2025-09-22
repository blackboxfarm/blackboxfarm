-- Create dedicated wallets for each campaign and remove wallet sharing
-- First, let's see what campaigns need new wallets

-- Create new wallets for CUP and Psyop campaigns (BAGLESS already has the main wallet)
INSERT INTO blackbox_wallets (pubkey, secret_key_encrypted, sol_balance, is_active)
VALUES 
  ('PLACEHOLDER_CUP_PUBKEY', 'PLACEHOLDER_CUP_SECRET', 0, true),
  ('PLACEHOLDER_PSYOP_PUBKEY', 'PLACEHOLDER_PSYOP_SECRET', 0, true);

-- Get the newly created wallet IDs (we'll need to update these with real wallet data)
-- This is just a placeholder structure - the actual wallet generation should be done through the frontend

-- Update campaign_wallets to use dedicated wallets
-- Remove the shared wallet associations for CUP and Psyop
DELETE FROM campaign_wallets 
WHERE campaign_id IN (
  SELECT id FROM blackbox_campaigns 
  WHERE nickname IN ('CUP', 'Psyop') 
  AND user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459'
);

-- Add comment to remind about wallet generation
COMMENT ON TABLE blackbox_wallets IS 'Each campaign should have its own dedicated wallet to prevent transaction attribution confusion';

-- Update RLS policy to be more specific about campaign ownership
DROP POLICY IF EXISTS "Users can view their wallet transactions" ON blackbox_transactions;

CREATE POLICY "Users can view their campaign transactions" 
ON blackbox_transactions
FOR ALL
USING (
  EXISTS (
    SELECT 1 
    FROM blackbox_campaigns bc 
    WHERE bc.id = blackbox_transactions.campaign_id 
    AND bc.user_id = auth.uid()
  )
);