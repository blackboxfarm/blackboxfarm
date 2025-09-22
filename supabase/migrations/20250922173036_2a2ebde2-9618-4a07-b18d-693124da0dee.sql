-- Create dedicated wallets for each campaign and remove wallet sharing
-- Create new wallets for CUP and Psyop campaigns (BAGLESS already has the main wallet)
INSERT INTO blackbox_wallets (pubkey, secret_key_encrypted, sol_balance, is_active)
VALUES 
  ('PLACEHOLDER_CUP_PUBKEY', 'PLACEHOLDER_CUP_SECRET', 0, true),
  ('PLACEHOLDER_PSYOP_PUBKEY', 'PLACEHOLDER_PSYOP_SECRET', 0, true);

-- Remove the shared wallet associations for CUP and Psyop
DELETE FROM campaign_wallets 
WHERE campaign_id IN (
  SELECT id FROM blackbox_campaigns 
  WHERE nickname IN ('CUP', 'Psyop') 
  AND user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459'
);

-- Update RLS policy to be more specific about campaign ownership
DROP POLICY IF EXISTS "Users can view their wallet transactions" ON blackbox_transactions;

CREATE POLICY "Users can view transactions by campaign ownership" 
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