-- Add token creation timestamp and market data to alerts
ALTER TABLE mega_whale_token_alerts 
  ADD COLUMN IF NOT EXISTS token_created_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS market_cap_at_detection NUMERIC,
  ADD COLUMN IF NOT EXISTS bonding_curve_progress NUMERIC;

-- Add smart auto-buy fields to auto_trades
ALTER TABLE mega_whale_auto_trades 
  ADD COLUMN IF NOT EXISTS buyability_score INTEGER,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS market_cap_at_check NUMERIC,
  ADD COLUMN IF NOT EXISTS unique_holders INTEGER,
  ADD COLUMN IF NOT EXISTS token_age_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS dev_has_bought BOOLEAN DEFAULT false;

-- Add smart auto-buy config fields to alert_config
ALTER TABLE mega_whale_alert_config 
  ADD COLUMN IF NOT EXISTS auto_buy_min_market_cap NUMERIC DEFAULT 9500,
  ADD COLUMN IF NOT EXISTS auto_buy_max_market_cap NUMERIC DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS auto_buy_min_holders INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_buy_min_age_minutes INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS auto_buy_require_dev_buy BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_buy_max_dump_ratio NUMERIC DEFAULT 0.5;