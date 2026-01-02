-- Add fantasy mode configuration to pumpfun_monitor_config
ALTER TABLE public.pumpfun_monitor_config 
ADD COLUMN IF NOT EXISTS fantasy_mode_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS fantasy_buy_amount_sol NUMERIC DEFAULT 0.1,
ADD COLUMN IF NOT EXISTS fantasy_target_multiplier NUMERIC DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS fantasy_sell_percentage NUMERIC DEFAULT 90,
ADD COLUMN IF NOT EXISTS fantasy_moonbag_percentage NUMERIC DEFAULT 10,
ADD COLUMN IF NOT EXISTS fantasy_moonbag_drawdown_limit NUMERIC DEFAULT 70,
ADD COLUMN IF NOT EXISTS fantasy_moonbag_volume_check BOOLEAN DEFAULT true;

-- Create fantasy positions table for tracking virtual trades
CREATE TABLE IF NOT EXISTS public.pumpfun_fantasy_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID REFERENCES public.pumpfun_watchlist(id) ON DELETE SET NULL,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  
  -- Entry tracking
  entry_price_usd NUMERIC,
  entry_price_sol NUMERIC,
  entry_amount_sol NUMERIC NOT NULL,
  token_amount NUMERIC,
  entry_at TIMESTAMPTZ DEFAULT now(),
  
  -- Current state
  current_price_usd NUMERIC,
  current_price_sol NUMERIC,
  unrealized_pnl_sol NUMERIC DEFAULT 0,
  unrealized_pnl_percent NUMERIC DEFAULT 0,
  
  -- Status: open, partial_sold, moonbag, closed, stopped_out
  status TEXT NOT NULL DEFAULT 'open',
  
  -- Target configuration
  target_multiplier NUMERIC DEFAULT 1.5,
  sell_percentage NUMERIC DEFAULT 90,
  moonbag_percentage NUMERIC DEFAULT 10,
  
  -- Main position tracking (after 90% sell)
  main_sold_at TIMESTAMPTZ,
  main_sold_price_usd NUMERIC,
  main_sold_amount_sol NUMERIC,
  main_realized_pnl_sol NUMERIC,
  
  -- Moonbag tracking
  moonbag_active BOOLEAN DEFAULT false,
  moonbag_token_amount NUMERIC,
  moonbag_entry_value_sol NUMERIC,
  moonbag_current_value_sol NUMERIC,
  moonbag_peak_price_usd NUMERIC,
  moonbag_drawdown_pct NUMERIC DEFAULT 0,
  
  -- Exit tracking
  exit_at TIMESTAMPTZ,
  exit_price_usd NUMERIC,
  exit_reason TEXT, -- target_hit, stop_loss, lp_removed, drawdown, manual
  
  -- Total P&L
  total_realized_pnl_sol NUMERIC DEFAULT 0,
  total_pnl_percent NUMERIC DEFAULT 0,
  
  -- Peak tracking
  peak_price_usd NUMERIC,
  peak_multiplier NUMERIC DEFAULT 1,
  peak_at TIMESTAMPTZ,
  
  -- Signal strength from watchlist
  signal_strength NUMERIC,
  
  -- LP tracking for moonbag
  lp_checked_at TIMESTAMPTZ,
  lp_liquidity_usd NUMERIC,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indices for efficient querying
CREATE INDEX IF NOT EXISTS idx_pumpfun_fantasy_positions_status ON public.pumpfun_fantasy_positions(status);
CREATE INDEX IF NOT EXISTS idx_pumpfun_fantasy_positions_token_mint ON public.pumpfun_fantasy_positions(token_mint);
CREATE INDEX IF NOT EXISTS idx_pumpfun_fantasy_positions_created_at ON public.pumpfun_fantasy_positions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pumpfun_fantasy_positions_moonbag ON public.pumpfun_fantasy_positions(moonbag_active) WHERE moonbag_active = true;

-- Create summary stats table
CREATE TABLE IF NOT EXISTS public.pumpfun_fantasy_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type TEXT DEFAULT 'daily', -- daily, weekly, all_time
  
  -- Position counts
  total_positions INTEGER DEFAULT 0,
  positions_hit_target INTEGER DEFAULT 0,
  positions_stopped_out INTEGER DEFAULT 0,
  positions_moonbag_sold INTEGER DEFAULT 0,
  positions_lp_removed INTEGER DEFAULT 0,
  
  -- Financial metrics
  total_virtual_invested_sol NUMERIC DEFAULT 0,
  total_realized_pnl_sol NUMERIC DEFAULT 0,
  avg_pnl_per_trade_sol NUMERIC DEFAULT 0,
  
  -- Time metrics
  avg_time_to_target_minutes NUMERIC,
  avg_hold_time_minutes NUMERIC,
  
  -- Win rates
  win_rate NUMERIC DEFAULT 0,
  moonbag_win_rate NUMERIC DEFAULT 0,
  
  -- Best/worst trades
  best_trade_pnl_sol NUMERIC,
  best_trade_token TEXT,
  worst_trade_pnl_sol NUMERIC,
  worst_trade_token TEXT,
  
  -- Multiplier stats
  avg_exit_multiplier NUMERIC,
  max_multiplier_achieved NUMERIC,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(period_start, period_end, period_type)
);

-- Enable RLS
ALTER TABLE public.pumpfun_fantasy_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pumpfun_fantasy_stats ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role full access to fantasy positions" 
ON public.pumpfun_fantasy_positions 
FOR ALL 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Service role full access to fantasy stats" 
ON public.pumpfun_fantasy_stats 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Add fantasy_position_id to watchlist for linking
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS fantasy_position_id UUID REFERENCES public.pumpfun_fantasy_positions(id) ON DELETE SET NULL;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_pumpfun_fantasy_positions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pumpfun_fantasy_positions_updated_at ON public.pumpfun_fantasy_positions;
CREATE TRIGGER trigger_pumpfun_fantasy_positions_updated_at
  BEFORE UPDATE ON public.pumpfun_fantasy_positions
  FOR EACH ROW
  EXECUTE FUNCTION update_pumpfun_fantasy_positions_updated_at();