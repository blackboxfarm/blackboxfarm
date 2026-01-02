-- Add fantasy_buy_amount_usd column with default $10
ALTER TABLE public.pumpfun_monitor_config 
ADD COLUMN IF NOT EXISTS fantasy_buy_amount_usd numeric DEFAULT 10;