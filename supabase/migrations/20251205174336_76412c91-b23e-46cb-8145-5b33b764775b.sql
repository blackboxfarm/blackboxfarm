-- Reset all incorrectly marked dust wallets
UPDATE mega_whale_offspring SET is_dust = false, dust_marked_at = NULL WHERE is_dust = true;

-- Add column to track when balance was last checked
ALTER TABLE mega_whale_offspring ADD COLUMN IF NOT EXISTS balance_checked_at TIMESTAMP WITH TIME ZONE;

-- Drop and recreate the mark_dust_wallets function with fixed logic
DROP FUNCTION IF EXISTS public.mark_dust_wallets(numeric, numeric, integer);

CREATE OR REPLACE FUNCTION public.mark_dust_wallets(
  min_sol_threshold NUMERIC DEFAULT 0.01,
  max_token_value_usd NUMERIC DEFAULT 0.0001,
  recheck_interval_hours INTEGER DEFAULT 24
)
RETURNS TABLE(marked_count INTEGER, total_dust INTEGER, total_active INTEGER, wallets_without_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  marked INTEGER;
  no_balance INTEGER;
BEGIN
  -- Count wallets that haven't had balance checked yet
  SELECT COUNT(*)::INTEGER INTO no_balance 
  FROM mega_whale_offspring 
  WHERE balance_checked_at IS NULL;
  
  -- Only mark wallets as dust if we have REAL balance data
  UPDATE mega_whale_offspring
  SET 
    is_dust = true,
    dust_marked_at = NOW(),
    dust_recheck_at = NOW() + (recheck_interval_hours || ' hours')::interval
  WHERE 
    is_dust = false
    AND balance_checked_at IS NOT NULL  -- CRITICAL: Only if we've checked balance!
    AND current_sol_balance < min_sol_threshold
    AND has_minted = false
    AND (last_activity_at IS NULL OR last_activity_at < NOW() - INTERVAL '7 days');
  
  GET DIAGNOSTICS marked = ROW_COUNT;
  
  RETURN QUERY
  SELECT 
    marked,
    (SELECT COUNT(*)::INTEGER FROM mega_whale_offspring WHERE is_dust = true),
    (SELECT COUNT(*)::INTEGER FROM mega_whale_offspring WHERE is_dust = false),
    no_balance;
END;
$$;