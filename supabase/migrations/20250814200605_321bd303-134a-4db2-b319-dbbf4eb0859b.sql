-- Create trading sessions table for persistent configuration
CREATE TABLE public.trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  token_mint TEXT NOT NULL,
  config JSONB NOT NULL, -- Store entire RunnerConfig
  start_mode TEXT CHECK (start_mode IN ('buying', 'selling')) DEFAULT 'buying',
  session_start_time TIMESTAMPTZ,
  last_activity TIMESTAMPTZ DEFAULT now(),
  daily_buy_usd DECIMAL DEFAULT 0,
  daily_key TEXT DEFAULT to_char(now(), 'YYYY-MM-DD'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create positions table for active trading lots
CREATE TABLE public.trading_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.trading_sessions(id) ON DELETE CASCADE,
  lot_id TEXT NOT NULL,
  entry_price DECIMAL NOT NULL,
  high_price DECIMAL NOT NULL,
  quantity_raw BIGINT NOT NULL,
  quantity_ui DECIMAL NOT NULL,
  entry_timestamp TIMESTAMPTZ NOT NULL,
  owner_pubkey TEXT NOT NULL,
  owner_secret TEXT NOT NULL, -- Encrypted in production
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'sold', 'stopped')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create trade history table
CREATE TABLE public.trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.trading_sessions(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.trading_positions(id) ON DELETE SET NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  token_mint TEXT NOT NULL,
  price_usd DECIMAL NOT NULL,
  quantity_ui DECIMAL NOT NULL,
  usd_amount DECIMAL NOT NULL,
  signatures TEXT[], -- Transaction signatures
  owner_pubkey TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT now()
);

-- Create activity logs table
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.trading_sessions(id) ON DELETE CASCADE,
  log_level TEXT DEFAULT 'info' CHECK (log_level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- Create wallet pools table
CREATE TABLE public.wallet_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.trading_sessions(id) ON DELETE CASCADE,
  pubkey TEXT NOT NULL,
  secret_key TEXT NOT NULL, -- Encrypted in production
  sol_balance DECIMAL DEFAULT 0,
  last_balance_check TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create token watchlist table
CREATE TABLE public.token_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.trading_sessions(id) ON DELETE CASCADE,
  token_mint TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  current_price DECIMAL,
  volatility_score INTEGER DEFAULT 0,
  last_price_check TIMESTAMPTZ DEFAULT now(),
  is_monitored BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'
);

-- Create emergency sell orders table
CREATE TABLE public.emergency_sells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.trading_sessions(id) ON DELETE CASCADE,
  limit_price DECIMAL NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.trading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_sells ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (users can only access their own data)
CREATE POLICY "Users can manage their trading sessions"
ON public.trading_sessions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their positions"
ON public.trading_positions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.trading_sessions WHERE id = session_id AND user_id = auth.uid())
);

CREATE POLICY "Users can view their trade history"
ON public.trade_history FOR ALL USING (
  EXISTS (SELECT 1 FROM public.trading_sessions WHERE id = session_id AND user_id = auth.uid())
);

CREATE POLICY "Users can view their activity logs"
ON public.activity_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.trading_sessions WHERE id = session_id AND user_id = auth.uid())
);

CREATE POLICY "Users can manage their wallet pools"
ON public.wallet_pools FOR ALL USING (
  EXISTS (SELECT 1 FROM public.trading_sessions WHERE id = session_id AND user_id = auth.uid())
);

CREATE POLICY "Users can manage their token watchlist"
ON public.token_watchlist FOR ALL USING (
  EXISTS (SELECT 1 FROM public.trading_sessions WHERE id = session_id AND user_id = auth.uid())
);

CREATE POLICY "Users can manage their emergency sells"
ON public.emergency_sells FOR ALL USING (
  EXISTS (SELECT 1 FROM public.trading_sessions WHERE id = session_id AND user_id = auth.uid())
);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trading_sessions_updated_at
  BEFORE UPDATE ON public.trading_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trading_positions_updated_at
  BEFORE UPDATE ON public.trading_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();