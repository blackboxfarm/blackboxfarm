-- Clean up duplicate open positions for the same token_mint
-- Keep only the oldest open position, close the newer duplicates
WITH duplicates AS (
  SELECT id, token_mint, 
         ROW_NUMBER() OVER (PARTITION BY token_mint ORDER BY created_at ASC) as rn
  FROM pumpfun_fantasy_positions
  WHERE status = 'open'
)
UPDATE pumpfun_fantasy_positions
SET 
  status = 'closed', 
  exit_reason = 'duplicate_cleanup'
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);