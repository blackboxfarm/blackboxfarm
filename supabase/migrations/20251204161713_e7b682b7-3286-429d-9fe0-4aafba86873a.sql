-- Pattern alerts table for predictive signals
CREATE TABLE public.mega_whale_pattern_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  mega_whale_id UUID REFERENCES public.mega_whales(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'funding_burst', 'coordinated_buy', 'profit_taking', 'new_launch_imminent', 'accumulation_pattern'
  severity TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  is_notified_email BOOLEAN DEFAULT false,
  is_notified_telegram BOOLEAN DEFAULT false,
  is_notified_browser BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE -- Some alerts expire (e.g., funding burst window)
);

-- Alert configuration per user
CREATE TABLE public.mega_whale_alert_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  -- Thresholds
  funding_burst_count INTEGER DEFAULT 5, -- Alert when X wallets funded
  funding_burst_window_minutes INTEGER DEFAULT 30, -- Within Y minutes
  coordinated_buy_count INTEGER DEFAULT 3, -- Alert when X offspring buy same token
  coordinated_buy_window_minutes INTEGER DEFAULT 10, -- Within Y minutes
  profit_taking_threshold_percent INTEGER DEFAULT 20, -- Alert when X% of offspring taking profits
  -- Notification preferences
  notify_email BOOLEAN DEFAULT true,
  notify_telegram BOOLEAN DEFAULT false,
  notify_browser BOOLEAN DEFAULT true,
  email_address TEXT,
  telegram_chat_id TEXT,
  -- Auto-trade settings for mints
  auto_buy_on_mint BOOLEAN DEFAULT false,
  auto_buy_amount_sol NUMERIC DEFAULT 0.5,
  auto_buy_wait_for_buys INTEGER DEFAULT 5, -- Wait for X buys before buying
  auto_buy_max_wait_minutes INTEGER DEFAULT 5, -- Max wait time
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Auto-trade executions tracking
CREATE TABLE public.mega_whale_auto_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  mega_whale_id UUID REFERENCES public.mega_whales(id) ON DELETE SET NULL,
  pattern_alert_id UUID REFERENCES public.mega_whale_pattern_alerts(id) ON DELETE SET NULL,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  trade_type TEXT NOT NULL DEFAULT 'buy', -- 'buy', 'sell'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'monitoring', 'executing', 'completed', 'failed', 'cancelled'
  amount_sol NUMERIC NOT NULL,
  -- Monitoring state
  buys_detected INTEGER DEFAULT 0,
  buys_required INTEGER DEFAULT 5,
  monitoring_started_at TIMESTAMP WITH TIME ZONE,
  monitoring_expires_at TIMESTAMP WITH TIME ZONE,
  -- Execution details
  executed_at TIMESTAMP WITH TIME ZONE,
  transaction_signature TEXT,
  execution_price NUMERIC,
  tokens_received NUMERIC,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX idx_pattern_alerts_user_created ON public.mega_whale_pattern_alerts(user_id, created_at DESC);
CREATE INDEX idx_pattern_alerts_unread ON public.mega_whale_pattern_alerts(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_auto_trades_pending ON public.mega_whale_auto_trades(status, monitoring_expires_at) WHERE status IN ('pending', 'monitoring');
CREATE INDEX idx_auto_trades_token ON public.mega_whale_auto_trades(token_mint, status);

-- Enable RLS
ALTER TABLE public.mega_whale_pattern_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mega_whale_alert_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mega_whale_auto_trades ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own pattern alerts" ON public.mega_whale_pattern_alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own pattern alerts" ON public.mega_whale_pattern_alerts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage pattern alerts" ON public.mega_whale_pattern_alerts
  FOR ALL USING (true);

CREATE POLICY "Users can manage own alert config" ON public.mega_whale_alert_config
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own auto trades" ON public.mega_whale_auto_trades
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage auto trades" ON public.mega_whale_auto_trades
  FOR ALL USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_mega_whale_alert_config_updated_at
  BEFORE UPDATE ON public.mega_whale_alert_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mega_whale_auto_trades_updated_at
  BEFORE UPDATE ON public.mega_whale_auto_trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.mega_whale_pattern_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mega_whale_auto_trades;