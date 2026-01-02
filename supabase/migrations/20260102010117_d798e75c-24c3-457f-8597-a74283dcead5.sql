-- Add missing columns for WebSocket-based token discovery
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS market_cap_sol NUMERIC,
ADD COLUMN IF NOT EXISTS twitter_url TEXT,
ADD COLUMN IF NOT EXISTS telegram_url TEXT,
ADD COLUMN IF NOT EXISTS website_url TEXT,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.pumpfun_watchlist.image_url IS 'Token image URL from pump.fun';
COMMENT ON COLUMN public.pumpfun_watchlist.market_cap_sol IS 'Market cap in SOL at discovery time';
COMMENT ON COLUMN public.pumpfun_watchlist.rejection_reason IS 'Reason for mayhem mode rejection';