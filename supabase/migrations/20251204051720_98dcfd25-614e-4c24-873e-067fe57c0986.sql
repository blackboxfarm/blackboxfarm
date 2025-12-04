-- Create whale frenzy configuration table
CREATE TABLE public.whale_frenzy_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  min_whales_for_frenzy INTEGER NOT NULL DEFAULT 3,
  time_window_seconds INTEGER NOT NULL DEFAULT 120,
  auto_buy_enabled BOOLEAN NOT NULL DEFAULT false,
  buy_amount_sol NUMERIC NOT NULL DEFAULT 0.1,
  max_slippage_bps INTEGER NOT NULL DEFAULT 500,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create whale wallets table (wallets to monitor)
CREATE TABLE public.whale_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  wallet_address TEXT NOT NULL,
  nickname TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, wallet_address)
);

-- Create whale frenzy events table
CREATE TABLE public.whale_frenzy_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  whale_count INTEGER NOT NULL,
  participating_wallets JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_buy_at TIMESTAMP WITH TIME ZONE,
  last_buy_at TIMESTAMP WITH TIME ZONE,
  auto_buy_executed BOOLEAN NOT NULL DEFAULT false,
  auto_buy_signature TEXT,
  auto_buy_amount_sol NUMERIC,
  auto_buy_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whale_frenzy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whale_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whale_frenzy_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whale_frenzy_config
CREATE POLICY "Users can manage their own frenzy config"
ON public.whale_frenzy_config
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for whale_wallets
CREATE POLICY "Users can manage their own whale wallets"
ON public.whale_wallets
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for whale_frenzy_events
CREATE POLICY "Users can view their own frenzy events"
ON public.whale_frenzy_events
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert frenzy events"
ON public.whale_frenzy_events
FOR INSERT
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_whale_wallets_user_active ON public.whale_wallets(user_id, is_active);
CREATE INDEX idx_whale_frenzy_events_user_token ON public.whale_frenzy_events(user_id, token_mint, detected_at);
CREATE INDEX idx_whale_frenzy_events_detected ON public.whale_frenzy_events(detected_at DESC);

-- Update timestamp trigger
CREATE TRIGGER update_whale_frenzy_config_updated_at
BEFORE UPDATE ON public.whale_frenzy_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();