-- PRUNE STALE DATA:

-- 1. Demote all buy_now tokens older than 2 hours to 'rejected'
UPDATE pumpfun_watchlist
SET 
  status = 'rejected',
  demoted_at = NOW(),
  demotion_reason = 'Stale: buy_now for over 2 hours',
  removal_reason = 'Auto-pruned: Stale buy_now token'
WHERE status = 'buy_now'
AND qualified_at < NOW() - INTERVAL '2 hours';

-- 2. Demote qualified tokens older than 1 hour with zero volume
UPDATE pumpfun_watchlist
SET 
  status = 'rejected',
  demoted_at = NOW(),
  demotion_reason = 'Stale: qualified over 1 hour with zero volume',
  removal_reason = 'Auto-pruned: Inactive qualified token'
WHERE status = 'qualified'
AND qualified_at < NOW() - INTERVAL '1 hour'
AND (volume_sol IS NULL OR volume_sol = 0);

-- 3. Demote qualified tokens older than 2 hours regardless
UPDATE pumpfun_watchlist
SET 
  status = 'rejected',
  demoted_at = NOW(),
  demotion_reason = 'Stale: qualified over 2 hours',
  removal_reason = 'Auto-pruned: Stale qualified token'
WHERE status = 'qualified'
AND qualified_at < NOW() - INTERVAL '2 hours';

-- Create index for faster lifecycle queries
CREATE INDEX IF NOT EXISTS idx_watchlist_qualified_status ON pumpfun_watchlist(qualified_at, status) WHERE status IN ('qualified', 'buy_now');