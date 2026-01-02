-- Clean up duplicate fantasy positions, keeping only the oldest entry per token_mint
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY token_mint ORDER BY created_at ASC) as rn
  FROM pumpfun_fantasy_positions
)
DELETE FROM pumpfun_fantasy_positions
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Create a unique partial index to prevent future duplicates
-- Only one open position allowed per token_mint
CREATE UNIQUE INDEX IF NOT EXISTS idx_fantasy_positions_unique_open_token 
ON pumpfun_fantasy_positions (token_mint) 
WHERE status = 'open';