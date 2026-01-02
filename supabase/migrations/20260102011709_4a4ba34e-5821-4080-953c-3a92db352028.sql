-- Drop the existing check constraint
ALTER TABLE pumpfun_watchlist 
DROP CONSTRAINT IF EXISTS pumpfun_watchlist_status_check;

-- Add updated check constraint with all required statuses
ALTER TABLE pumpfun_watchlist 
ADD CONSTRAINT pumpfun_watchlist_status_check 
CHECK (status = ANY (ARRAY[
  'pending_triage',
  'watching', 
  'qualified', 
  'dead', 
  'bombed', 
  'removed', 
  'buy_now',
  'rejected'
]));