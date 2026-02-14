
-- Add new fantasy filter config columns to pumpfun_monitor_config
ALTER TABLE public.pumpfun_monitor_config
ADD COLUMN IF NOT EXISTS min_market_cap_usd NUMERIC DEFAULT 5000,
ADD COLUMN IF NOT EXISTS min_holder_count_fantasy INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS max_rugcheck_score_fantasy INTEGER DEFAULT 5000,
ADD COLUMN IF NOT EXISTS min_volume_sol_fantasy NUMERIC DEFAULT 5;

-- Add comment explaining the columns
COMMENT ON COLUMN public.pumpfun_monitor_config.min_market_cap_usd IS 'Minimum market cap in USD for fantasy qualification gate';
COMMENT ON COLUMN public.pumpfun_monitor_config.min_holder_count_fantasy IS 'Minimum holder count at qualification for fantasy (tighter than base qualification_holder_count)';
COMMENT ON COLUMN public.pumpfun_monitor_config.max_rugcheck_score_fantasy IS 'Maximum raw rugcheck score allowed (lower = safer). Tokens above this are rejected.';
COMMENT ON COLUMN public.pumpfun_monitor_config.min_volume_sol_fantasy IS 'Minimum 24h volume in SOL for fantasy qualification gate';
