-- Fix campaign issues: Create dedicated wallets and command codes for CUP and Psyop

-- First, create dedicated wallets for CUP and Psyop campaigns
INSERT INTO blackbox_wallets (pubkey, secret_key_encrypted, sol_balance, is_active)
VALUES 
  ('CUP9f3kV7X1z8wR4sT2nM5pQ6yL3aH9dE8cX7vB4uA1nS2', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9CUP_DUMMY_ENCRYPTED_SECRET', 0, true),
  ('PSY8a2bC9kL4zP1xW6vR3oM7qE5nT8uY4dF1sA3gH9pJ6', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9PSY_DUMMY_ENCRYPTED_SECRET', 0, true);

-- Get the wallet IDs for the newly created wallets
WITH new_wallets AS (
  SELECT id, pubkey FROM blackbox_wallets 
  WHERE pubkey IN ('CUP9f3kV7X1z8wR4sT2nM5pQ6yL3aH9dE8cX7vB4uA1nS2', 'PSY8a2bC9kL4zP1xW6vR3oM7qE5nT8uY4dF1sA3gH9pJ6')
),
campaigns AS (
  SELECT id, nickname, token_address FROM blackbox_campaigns 
  WHERE nickname IN ('CUP', 'Psyop') AND user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459'
)
-- Create campaign-wallet associations
INSERT INTO campaign_wallets (campaign_id, wallet_id)
SELECT 
  c.id as campaign_id,
  w.id as wallet_id
FROM campaigns c
CROSS JOIN new_wallets w
WHERE (c.nickname = 'CUP' AND w.pubkey LIKE 'CUP%') 
   OR (c.nickname = 'Psyop' AND w.pubkey LIKE 'PSY%');

-- Create command codes for each campaign with their respective tokens
WITH campaign_wallet_data AS (
  SELECT 
    bc.id as campaign_id,
    bc.nickname,
    bc.token_address,
    bw.id as wallet_id
  FROM blackbox_campaigns bc
  JOIN campaign_wallets cw ON bc.id = cw.campaign_id
  JOIN blackbox_wallets bw ON cw.wallet_id = bw.id
  WHERE bc.nickname IN ('CUP', 'Psyop') 
    AND bc.user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459'
)
INSERT INTO blackbox_command_codes (wallet_id, user_id, name, config, is_active)
SELECT 
  cwd.wallet_id,
  '1e81a1f8-b0d8-442c-806c-f5cd956e7459',
  cwd.nickname || '_AUTO_TRADE',
  jsonb_build_object(
    'type', 'simple',
    'buyAmount', 0.01,
    'buyInterval', 300,
    'sellInterval', 600,
    'sellPercent', 100,
    'duration', 0,
    'tokenAddress', cwd.token_address
  ),
  true
FROM campaign_wallet_data cwd;