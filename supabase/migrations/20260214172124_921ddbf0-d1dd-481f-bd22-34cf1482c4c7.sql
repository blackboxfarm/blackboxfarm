-- Add dust holder percentage config
ALTER TABLE public.pumpfun_monitor_config 
ADD COLUMN IF NOT EXISTS max_dust_holder_pct integer DEFAULT 25;

-- Add dust_holder_pct tracking to watchlist
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS dust_holder_pct numeric DEFAULT NULL;
