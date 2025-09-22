-- Step 1: Add campaign_id to blackbox_transactions to track which campaign actually executed the trade
ALTER TABLE blackbox_transactions 
ADD COLUMN IF NOT EXISTS campaign_id uuid;

-- Step 2: Clean up duplicate transactions by keeping only one record per signature and linking it to the correct campaign
-- First, let's create a temporary table with the proper campaign assignments
CREATE TEMP TABLE transaction_cleanup AS
SELECT DISTINCT
    bt.signature,
    bt.wallet_id,
    bt.command_code_id,
    -- Assign to the campaign that owns the active command (BAGLESS in this case since ZAP command is active)
    (SELECT cw.campaign_id 
     FROM campaign_wallets cw 
     JOIN blackbox_campaigns bc ON cw.campaign_id = bc.id 
     WHERE cw.wallet_id = bt.wallet_id 
     AND bc.nickname = 'BAGLESS' 
     LIMIT 1) as correct_campaign_id,
    MIN(bt.id) as keep_transaction_id  -- Keep the first occurrence
FROM blackbox_transactions bt
WHERE bt.signature IS NOT NULL
GROUP BY bt.signature, bt.wallet_id, bt.command_code_id;

-- Step 3: Update the transactions we're keeping with correct campaign_id
UPDATE blackbox_transactions bt
SET campaign_id = tc.correct_campaign_id
FROM transaction_cleanup tc
WHERE bt.id = tc.keep_transaction_id;

-- Step 4: Delete duplicate transactions (keep only one per signature)
DELETE FROM blackbox_transactions bt
WHERE bt.signature IS NOT NULL
AND bt.id NOT IN (
    SELECT keep_transaction_id 
    FROM transaction_cleanup
);

-- Step 5: Create unique constraint to prevent future duplicates
ALTER TABLE blackbox_transactions 
ADD CONSTRAINT unique_transaction_signature 
UNIQUE (signature);

-- Step 6: Add foreign key relationship to campaigns
ALTER TABLE blackbox_transactions
ADD CONSTRAINT fk_transaction_campaign
FOREIGN KEY (campaign_id) 
REFERENCES blackbox_campaigns(id) 
ON DELETE CASCADE;