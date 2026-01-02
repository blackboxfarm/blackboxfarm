-- Phase 4: Enhanced Buyer Analysis columns
ALTER TABLE public.pumpfun_watchlist
ADD COLUMN IF NOT EXISTS gini_coefficient NUMERIC,
ADD COLUMN IF NOT EXISTS linked_wallet_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bundled_buy_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS suspicious_wallet_pct NUMERIC,
ADD COLUMN IF NOT EXISTS fresh_wallet_pct NUMERIC,
ADD COLUMN IF NOT EXISTS insider_activity_detected BOOLEAN DEFAULT false;

-- Phase 4 config thresholds
ALTER TABLE public.pumpfun_monitor_config
ADD COLUMN IF NOT EXISTS max_gini_coefficient NUMERIC DEFAULT 0.85,
ADD COLUMN IF NOT EXISTS max_linked_wallet_count INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS max_bundled_buy_count INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS max_fresh_wallet_pct NUMERIC DEFAULT 50,
ADD COLUMN IF NOT EXISTS max_suspicious_wallet_pct NUMERIC DEFAULT 30;

-- Add index for insider detection
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_insider_activity 
ON public.pumpfun_watchlist(insider_activity_detected) 
WHERE insider_activity_detected = true;

COMMENT ON COLUMN public.pumpfun_watchlist.gini_coefficient IS 'Distribution inequality coefficient (0-1, higher = more concentrated)';
COMMENT ON COLUMN public.pumpfun_watchlist.linked_wallet_count IS 'Number of wallets detected as linked via funding patterns';
COMMENT ON COLUMN public.pumpfun_watchlist.bundled_buy_count IS 'Number of simultaneous buy transactions detected';
COMMENT ON COLUMN public.pumpfun_watchlist.suspicious_wallet_pct IS 'Percentage of holders flagged as suspicious';
COMMENT ON COLUMN public.pumpfun_watchlist.fresh_wallet_pct IS 'Percentage of holders with fresh wallets (<24h old)';
COMMENT ON COLUMN public.pumpfun_watchlist.insider_activity_detected IS 'True if insider/bundled activity patterns detected';