-- Add dust wallet tracking columns to mega_whale_offspring
ALTER TABLE mega_whale_offspring ADD COLUMN IF NOT EXISTS is_dust BOOLEAN DEFAULT false;
ALTER TABLE mega_whale_offspring ADD COLUMN IF NOT EXISTS dust_marked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE mega_whale_offspring ADD COLUMN IF NOT EXISTS dust_recheck_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE mega_whale_offspring ADD COLUMN IF NOT EXISTS current_sol_balance NUMERIC DEFAULT 0;
ALTER TABLE mega_whale_offspring ADD COLUMN IF NOT EXISTS dust_token_value_usd NUMERIC DEFAULT 0;

-- Create index for efficient dust wallet queries
CREATE INDEX IF NOT EXISTS idx_mega_whale_offspring_dust ON mega_whale_offspring(is_dust, dust_recheck_at) WHERE is_dust = true;
CREATE INDEX IF NOT EXISTS idx_mega_whale_offspring_active ON mega_whale_offspring(is_dust, total_sol_received) WHERE is_dust = false;

-- Create function to mark dust wallets
CREATE OR REPLACE FUNCTION mark_dust_wallets(
  min_sol_threshold NUMERIC DEFAULT 0.01,
  max_token_value_usd NUMERIC DEFAULT 0.0001,
  recheck_interval_hours INTEGER DEFAULT 24
)
RETURNS TABLE(marked_count INTEGER, total_dust INTEGER, total_active INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  marked INTEGER;
BEGIN
  -- Mark wallets as dust based on criteria
  UPDATE mega_whale_offspring
  SET 
    is_dust = true,
    dust_marked_at = NOW(),
    dust_recheck_at = NOW() + (recheck_interval_hours || ' hours')::interval
  WHERE 
    is_dust = false
    AND (total_sol_received < min_sol_threshold OR current_sol_balance < 0.001)
    AND has_minted = false
    AND (last_activity_at IS NULL OR last_activity_at < NOW() - INTERVAL '7 days');
  
  GET DIAGNOSTICS marked = ROW_COUNT;
  
  RETURN QUERY
  SELECT 
    marked,
    (SELECT COUNT(*)::INTEGER FROM mega_whale_offspring WHERE is_dust = true),
    (SELECT COUNT(*)::INTEGER FROM mega_whale_offspring WHERE is_dust = false);
END;
$$;

-- Create function to get dust wallet statistics
CREATE OR REPLACE FUNCTION get_dust_wallet_stats(whale_id UUID DEFAULT NULL)
RETURNS TABLE(
  total_wallets BIGINT,
  active_wallets BIGINT,
  dust_wallets BIGINT,
  dust_percentage NUMERIC,
  avg_dust_sol NUMERIC,
  recently_reactivated BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_wallets,
    COUNT(*) FILTER (WHERE is_dust = false)::BIGINT as active_wallets,
    COUNT(*) FILTER (WHERE is_dust = true)::BIGINT as dust_wallets,
    ROUND((COUNT(*) FILTER (WHERE is_dust = true)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) as dust_percentage,
    ROUND(AVG(total_sol_received) FILTER (WHERE is_dust = true), 4) as avg_dust_sol,
    COUNT(*) FILTER (WHERE is_dust = false AND dust_marked_at IS NOT NULL AND dust_marked_at > NOW() - INTERVAL '24 hours')::BIGINT as recently_reactivated
  FROM mega_whale_offspring
  WHERE (whale_id IS NULL OR mega_whale_id = whale_id);
END;
$$;