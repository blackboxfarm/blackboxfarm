-- Emergency cleanup: Mark zombie watching tokens as dead
-- Tokens watching for > 2 hours with <= 3 holders = dead
UPDATE pumpfun_watchlist 
SET status = 'dead', 
    rejection_type = 'soft',
    removed_at = NOW(),
    removal_reason = 'Cleanup: Stale zombie token (low holders, watched too long)',
    last_processor = 'cleanup-migration'
WHERE status = 'watching' 
  AND first_seen_at < NOW() - INTERVAL '2 hours'
  AND holder_count <= 3;

-- Also mark tokens watching for > 4 hours regardless of metrics as dead
UPDATE pumpfun_watchlist 
SET status = 'dead',
    rejection_type = 'soft',
    removed_at = NOW(),
    removal_reason = 'Cleanup: Exceeded max watch time (4+ hours)',
    last_processor = 'cleanup-migration'
WHERE status = 'watching' 
  AND first_seen_at < NOW() - INTERVAL '4 hours';

-- Clean up very old rejected tokens (> 12 hours) to dead
UPDATE pumpfun_watchlist 
SET status = 'dead',
    removed_at = COALESCE(removed_at, NOW()),
    removal_reason = COALESCE(removal_reason, '') || ' | Cleanup: Old rejected token',
    last_processor = 'cleanup-migration'
WHERE status = 'rejected'
  AND first_seen_at < NOW() - INTERVAL '12 hours';