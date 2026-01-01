-- Add bonding_curve_pct column to pumpfun_watchlist
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS bonding_curve_pct NUMERIC DEFAULT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.pumpfun_watchlist.bonding_curve_pct IS 'Percentage of tokens still on the bonding curve (100% = just launched, 0% = graduated to Raydium)';