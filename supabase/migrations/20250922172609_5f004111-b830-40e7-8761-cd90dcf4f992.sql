-- Step 1: Add campaign_id to blackbox_transactions to track which campaign actually executed the trade
ALTER TABLE blackbox_transactions 
ADD COLUMN IF NOT EXISTS campaign_id uuid;

-- Step 2: Clean up duplicate transactions by keeping only one record per signature and linking it to the correct campaign
-- Update all transactions to have the campaign_id from BAGLESS (the active campaign with the ZAP command)
UPDATE blackbox_transactions bt
SET campaign_id = (
    SELECT bc.id 
    FROM blackbox_campaigns bc 
    JOIN campaign_wallets cw ON bc.id = cw.campaign_id 
    WHERE cw.wallet_id = bt.wallet_id 
    AND bc.nickname = 'BAGLESS' 
    AND bc.user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459'
    LIMIT 1
)
WHERE bt.wallet_id = '709277cc-65e9-44c1-acc7-f3c7c18d8ad8';

-- Step 3: Create a temporary table with transaction IDs to keep (first occurrence of each signature)
CREATE TEMP TABLE transactions_to_keep AS
SELECT 
    signature,
    (array_agg(id ORDER BY executed_at ASC))[1] as keep_id
FROM blackbox_transactions 
WHERE signature IS NOT NULL
GROUP BY signature;

-- Step 4: Delete duplicate transactions (keep only the first occurrence of each signature)
DELETE FROM blackbox_transactions bt
WHERE bt.signature IS NOT NULL
AND bt.id NOT IN (
    SELECT keep_id FROM transactions_to_keep
);

-- Step 5: Create unique constraint to prevent future duplicates
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_transaction_signature'
    ) THEN
        ALTER TABLE blackbox_transactions 
        ADD CONSTRAINT unique_transaction_signature 
        UNIQUE (signature);
    END IF;
END $$;