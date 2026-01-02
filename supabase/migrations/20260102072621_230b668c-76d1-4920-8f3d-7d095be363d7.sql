-- Two-Stage RugCheck Integration: Database Schema Changes

-- Add RugCheck columns to pumpfun_watchlist
ALTER TABLE public.pumpfun_watchlist
ADD COLUMN IF NOT EXISTS rugcheck_score INTEGER,
ADD COLUMN IF NOT EXISTS rugcheck_normalised NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS rugcheck_risks JSONB,
ADD COLUMN IF NOT EXISTS rugcheck_passed BOOLEAN,
ADD COLUMN IF NOT EXISTS rugcheck_checked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS rugcheck_version INTEGER DEFAULT 1;

-- Add RugCheck config thresholds to pumpfun_monitor_config
ALTER TABLE public.pumpfun_monitor_config
ADD COLUMN IF NOT EXISTS min_rugcheck_score INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS rugcheck_critical_risks TEXT[] DEFAULT ARRAY[
  'Freeze Authority still enabled',
  'Mint Authority still enabled', 
  'Low Liquidity',
  'Copycat token',
  'Top 10 holders own high percentage',
  'Single holder owns high percentage'
],
ADD COLUMN IF NOT EXISTS rugcheck_recheck_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS rugcheck_rate_limit_ms INTEGER DEFAULT 500;

-- Add index for efficient filtering by rugcheck status
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_rugcheck_passed 
ON public.pumpfun_watchlist(rugcheck_passed) 
WHERE status = 'watching';

CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_rugcheck_checked_at 
ON public.pumpfun_watchlist(rugcheck_checked_at) 
WHERE status = 'watching';

-- Comment the new columns for documentation
COMMENT ON COLUMN public.pumpfun_watchlist.rugcheck_score IS 'Raw RugCheck API score (0-100, higher = safer)';
COMMENT ON COLUMN public.pumpfun_watchlist.rugcheck_normalised IS 'Normalised RugCheck score (0-100)';
COMMENT ON COLUMN public.pumpfun_watchlist.rugcheck_risks IS 'Array of risk objects from RugCheck API';
COMMENT ON COLUMN public.pumpfun_watchlist.rugcheck_passed IS 'Whether token passed RugCheck threshold';
COMMENT ON COLUMN public.pumpfun_watchlist.rugcheck_checked_at IS 'Last time RugCheck was verified';
COMMENT ON COLUMN public.pumpfun_watchlist.rugcheck_version IS 'Version of rugcheck data for cache invalidation';

COMMENT ON COLUMN public.pumpfun_monitor_config.min_rugcheck_score IS 'Minimum RugCheck score to pass (default 50)';
COMMENT ON COLUMN public.pumpfun_monitor_config.rugcheck_critical_risks IS 'List of critical risk names that cause permanent rejection';
COMMENT ON COLUMN public.pumpfun_monitor_config.rugcheck_recheck_minutes IS 'Minutes before re-checking RugCheck at buy gate';
COMMENT ON COLUMN public.pumpfun_monitor_config.rugcheck_rate_limit_ms IS 'Delay between RugCheck API calls';