-- Add graduation tracking to pumpfun_watchlist
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS raydium_pool_address TEXT,
ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_graduated BOOLEAN DEFAULT FALSE;

-- Add buy execution tracking
ALTER TABLE public.pumpfun_watchlist
ADD COLUMN IF NOT EXISTS buy_attempted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS buy_executed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS buy_tx_signature TEXT,
ADD COLUMN IF NOT EXISTS buy_amount_sol DECIMAL(18,9),
ADD COLUMN IF NOT EXISTS buy_error TEXT;

-- Add config for buy execution
ALTER TABLE public.pumpfun_monitor_config
ADD COLUMN IF NOT EXISTS auto_buy_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS buy_amount_sol DECIMAL(18,9) DEFAULT 0.05,
ADD COLUMN IF NOT EXISTS max_buy_price_usd DECIMAL(18,9) DEFAULT 0.001,
ADD COLUMN IF NOT EXISTS buy_slippage_bps INTEGER DEFAULT 500,
ADD COLUMN IF NOT EXISTS buy_priority_fee_sol DECIMAL(18,9) DEFAULT 0.001,
ADD COLUMN IF NOT EXISTS buy_wallet_id TEXT;

-- Create index for graduation status
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_graduated ON public.pumpfun_watchlist(is_graduated) WHERE is_graduated = TRUE;

-- Create index for buy execution
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_buy_now ON public.pumpfun_watchlist(status) WHERE status = 'buy_now';