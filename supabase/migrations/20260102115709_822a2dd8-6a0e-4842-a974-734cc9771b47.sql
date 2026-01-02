-- Add caching columns for authority and bundle checks to reduce Helius API usage
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS authority_checked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bundle_checked_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for efficient cache lookups
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_authority_checked 
ON public.pumpfun_watchlist (authority_checked_at) 
WHERE authority_checked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_bundle_checked 
ON public.pumpfun_watchlist (bundle_checked_at) 
WHERE bundle_checked_at IS NOT NULL;

-- Add comment explaining the purpose
COMMENT ON COLUMN public.pumpfun_watchlist.authority_checked_at IS 'Last time mint/freeze authority was checked via Helius RPC - skip check if within 1 hour';
COMMENT ON COLUMN public.pumpfun_watchlist.bundle_checked_at IS 'Last time bundled buy detection was run - skip check if within 1 hour';