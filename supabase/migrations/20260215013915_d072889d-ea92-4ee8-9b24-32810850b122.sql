
-- Banker Pool: Core bankroll tracking
CREATE TABLE public.banker_pool (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  starting_capital NUMERIC NOT NULL DEFAULT 250.00,
  current_capital NUMERIC NOT NULL DEFAULT 250.00,
  total_invested NUMERIC NOT NULL DEFAULT 0,
  total_returned NUMERIC NOT NULL DEFAULT 0,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  largest_win NUMERIC NOT NULL DEFAULT 0,
  largest_loss NUMERIC NOT NULL DEFAULT 0,
  max_drawdown_pct NUMERIC NOT NULL DEFAULT 0,
  peak_capital NUMERIC NOT NULL DEFAULT 250.00,
  -- Risk config
  max_position_pct NUMERIC NOT NULL DEFAULT 4.0,       -- max 4% of bankroll per trade ($10 on $250)
  max_open_positions INTEGER NOT NULL DEFAULT 5,
  stop_loss_pct NUMERIC NOT NULL DEFAULT 25.0,          -- cut at -25%
  take_profit_pct NUMERIC NOT NULL DEFAULT 100.0,       -- take profit at 2x
  trailing_stop_pct NUMERIC NOT NULL DEFAULT 15.0,      -- trail 15% from peak
  min_score_to_enter NUMERIC NOT NULL DEFAULT 70,       -- only enter score >= 70
  daily_loss_limit_pct NUMERIC NOT NULL DEFAULT 10.0,   -- stop trading if down 10% today
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Banker Pool: Individual trade journal
CREATE TABLE public.banker_pool_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id UUID NOT NULL REFERENCES banker_pool(id),
  fantasy_position_id UUID,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  -- Entry
  entry_price_usd NUMERIC NOT NULL,
  entry_mcap NUMERIC,
  entry_score NUMERIC,
  entry_reason TEXT,
  position_size_usd NUMERIC NOT NULL,
  position_size_pct NUMERIC NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exit
  exit_price_usd NUMERIC,
  exit_reason TEXT,      -- 'stop_loss', 'take_profit', 'trailing_stop', 'manual', 'time_decay'
  exited_at TIMESTAMPTZ,
  -- P&L
  pnl_usd NUMERIC,
  pnl_pct NUMERIC,
  peak_price_usd NUMERIC,
  peak_multiplier NUMERIC,
  -- State
  status TEXT NOT NULL DEFAULT 'open',  -- 'open', 'closed_win', 'closed_loss'
  current_price_usd NUMERIC,
  current_multiplier NUMERIC,
  stop_loss_price NUMERIC,
  take_profit_price NUMERIC,
  trailing_stop_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Banker Pool: Daily stats for equity curve
CREATE TABLE public.banker_pool_daily_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id UUID NOT NULL REFERENCES banker_pool(id),
  date DATE NOT NULL,
  opening_capital NUMERIC NOT NULL,
  closing_capital NUMERIC NOT NULL,
  daily_pnl NUMERIC NOT NULL DEFAULT 0,
  daily_pnl_pct NUMERIC NOT NULL DEFAULT 0,
  trades_opened INTEGER NOT NULL DEFAULT 0,
  trades_closed INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  best_trade_pnl NUMERIC,
  worst_trade_pnl NUMERIC,
  max_drawdown_pct NUMERIC,
  open_positions INTEGER NOT NULL DEFAULT 0,
  capital_at_risk NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pool_id, date)
);

-- Enable RLS
ALTER TABLE public.banker_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banker_pool_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banker_pool_daily_stats ENABLE ROW LEVEL SECURITY;

-- Super admin only policies
CREATE POLICY "Super admins manage banker pool" ON public.banker_pool
  FOR ALL USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins manage banker trades" ON public.banker_pool_trades
  FOR ALL USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins manage banker daily stats" ON public.banker_pool_daily_stats
  FOR ALL USING (public.is_super_admin(auth.uid()));

-- Service role needs access for edge functions
CREATE POLICY "Service role banker pool" ON public.banker_pool
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role banker trades" ON public.banker_pool_trades
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role banker daily stats" ON public.banker_pool_daily_stats
  FOR ALL USING (auth.role() = 'service_role');

-- Updated_at triggers
CREATE TRIGGER update_banker_pool_updated_at
  BEFORE UPDATE ON public.banker_pool
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_banker_pool_trades_updated_at
  BEFORE UPDATE ON public.banker_pool_trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_banker_trades_pool_status ON public.banker_pool_trades(pool_id, status);
CREATE INDEX idx_banker_trades_token ON public.banker_pool_trades(token_mint);
CREATE INDEX idx_banker_daily_pool_date ON public.banker_pool_daily_stats(pool_id, date);
