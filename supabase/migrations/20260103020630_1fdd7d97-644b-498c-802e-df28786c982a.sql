-- Close fantasy positions for dead tokens (older than 6 hours)
-- The columns were added in the previous migration attempt
UPDATE pumpfun_fantasy_positions
SET 
  status = 'closed',
  exit_reason = 'pruned_stale_token',
  exit_at = NOW(),
  updated_at = NOW()
WHERE status = 'open'
AND entry_at < NOW() - INTERVAL '6 hours';