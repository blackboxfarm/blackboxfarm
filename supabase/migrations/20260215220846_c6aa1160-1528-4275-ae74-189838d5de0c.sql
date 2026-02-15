
-- Add pipeline price tracking columns to pumpfun_watchlist
ALTER TABLE public.pumpfun_watchlist 
  ADD COLUMN IF NOT EXISTS price_at_discovery_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS price_at_qualified_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS price_at_buy_now_usd NUMERIC;

-- Add max market cap and stop-loss config to pumpfun_monitor_config
ALTER TABLE public.pumpfun_monitor_config
  ADD COLUMN IF NOT EXISTS max_market_cap_usd NUMERIC DEFAULT 12000,
  ADD COLUMN IF NOT EXISTS fantasy_stop_loss_pct NUMERIC DEFAULT 35;
