-- Add new config columns for polling, retention, and re-evaluation
ALTER TABLE pumpfun_monitor_config 
ADD COLUMN IF NOT EXISTS polling_interval_seconds INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS log_retention_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS dead_retention_hours INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS max_reevaluate_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS resurrection_holder_threshold INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS resurrection_volume_threshold_sol NUMERIC DEFAULT 0.1;

-- Add permanent_reject and buy_now support to watchlist
ALTER TABLE pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS permanent_reject BOOLEAN DEFAULT false;

-- Update status check constraint to include buy_now
ALTER TABLE pumpfun_watchlist DROP CONSTRAINT IF EXISTS pumpfun_watchlist_status_check;
ALTER TABLE pumpfun_watchlist ADD CONSTRAINT pumpfun_watchlist_status_check 
  CHECK (status IN ('watching', 'qualified', 'dead', 'bombed', 'removed', 'buy_now'));