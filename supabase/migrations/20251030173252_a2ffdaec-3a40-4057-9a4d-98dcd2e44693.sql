-- Add creator tracking columns to token_lifecycle if they don't exist
ALTER TABLE token_lifecycle 
ADD COLUMN IF NOT EXISTS creator_wallet text,
ADD COLUMN IF NOT EXISTS developer_id uuid REFERENCES developer_profiles(id);

-- Create index for faster developer lookups
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_developer 
ON token_lifecycle(developer_id) WHERE developer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_token_lifecycle_creator_wallet 
ON token_lifecycle(creator_wallet) WHERE creator_wallet IS NOT NULL;

-- Add index for common developer pattern matching
CREATE INDEX IF NOT EXISTS idx_developer_profiles_master_wallet 
ON developer_profiles(master_wallet_address);

-- Add metadata column to developer_profiles if needed for enhanced tracking
ALTER TABLE developer_profiles 
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Create view for developer genealogy analytics
CREATE OR REPLACE VIEW developer_genealogy AS
SELECT 
  dp.id as developer_id,
  dp.display_name,
  dp.master_wallet_address,
  dp.integrity_score,
  dp.trust_level,
  dp.kyc_verified,
  COUNT(DISTINCT tl.token_mint) as total_tokens_tracked,
  COUNT(DISTINCT CASE WHEN tl.highest_rank <= 10 THEN tl.token_mint END) as tokens_in_top_10,
  COUNT(DISTINCT CASE WHEN tl.highest_rank <= 100 THEN tl.token_mint END) as tokens_in_top_100,
  COUNT(DISTINCT CASE WHEN tl.highest_rank <= 200 THEN tl.token_mint END) as tokens_in_top_200,
  MIN(tl.first_seen_at) as first_token_discovered,
  MAX(tl.last_seen_at) as most_recent_token,
  AVG(tl.highest_rank) as avg_best_rank,
  COUNT(DISTINCT dw.wallet_address) as total_wallets_in_network,
  dp.tags,
  dp.created_at as developer_first_tracked
FROM developer_profiles dp
LEFT JOIN token_lifecycle tl ON tl.developer_id = dp.id
LEFT JOIN developer_wallets dw ON dw.developer_id = dp.id
GROUP BY dp.id, dp.display_name, dp.master_wallet_address, dp.integrity_score, 
         dp.trust_level, dp.kyc_verified, dp.tags, dp.created_at;

-- Create function to identify common developer patterns
CREATE OR REPLACE FUNCTION find_common_developer_origins()
RETURNS TABLE (
  developer_id uuid,
  display_name text,
  master_wallet text,
  shared_wallets_count bigint,
  related_developers jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH wallet_sharing AS (
    SELECT 
      dw1.developer_id as dev1,
      dw2.developer_id as dev2,
      COUNT(DISTINCT dw1.wallet_address) as shared_count
    FROM developer_wallets dw1
    JOIN developer_wallets dw2 
      ON dw1.wallet_address = dw2.wallet_address 
      AND dw1.developer_id != dw2.developer_id
    GROUP BY dw1.developer_id, dw2.developer_id
    HAVING COUNT(DISTINCT dw1.wallet_address) > 0
  )
  SELECT 
    dp.id,
    dp.display_name,
    dp.master_wallet_address,
    COUNT(DISTINCT ws.dev2) as shared_wallets_count,
    jsonb_agg(DISTINCT jsonb_build_object(
      'developer_id', ws.dev2,
      'shared_wallet_count', ws.shared_count
    )) as related_developers
  FROM developer_profiles dp
  LEFT JOIN wallet_sharing ws ON ws.dev1 = dp.id
  GROUP BY dp.id, dp.display_name, dp.master_wallet_address
  HAVING COUNT(DISTINCT ws.dev2) > 0;
END;
$$ LANGUAGE plpgsql;