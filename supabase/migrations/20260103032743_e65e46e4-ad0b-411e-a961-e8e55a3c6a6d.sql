-- Emergency cleanup: Mark all watching tokens older than 60 minutes as dead
-- These are stuck because API calls keep failing
UPDATE pumpfun_watchlist 
SET 
  status = 'dead',
  rejection_type = 'soft',
  removed_at = NOW(),
  removal_reason = 'Emergency cleanup: Token watching > 60m with no progress',
  last_processor = 'emergency-cleanup'
WHERE status = 'watching' 
  AND first_seen_at < NOW() - INTERVAL '60 minutes';

-- Also kill any watching tokens with 1 holder that are > 30 minutes old  
UPDATE pumpfun_watchlist 
SET 
  status = 'dead',
  rejection_type = 'soft',
  removed_at = NOW(),
  removal_reason = 'Emergency cleanup: Token > 30m with 1 holder',
  last_processor = 'emergency-cleanup'
WHERE status = 'watching' 
  AND first_seen_at < NOW() - INTERVAL '30 minutes'
  AND holder_count <= 1;