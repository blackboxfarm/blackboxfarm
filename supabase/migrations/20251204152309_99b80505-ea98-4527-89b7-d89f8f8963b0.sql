-- MEGA WHALE Genealogy Tracking System
-- Tracks source whales and their offspring wallet networks for token mint detection

-- Main mega whales table (source wallets)
CREATE TABLE public.mega_whales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  wallet_address TEXT NOT NULL,
  nickname TEXT,
  source_cex TEXT, -- Robinhood, Coinbase, Kraken, etc.
  avatar_url TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  helius_webhook_id TEXT,
  total_offspring_wallets INTEGER DEFAULT 0,
  total_tokens_minted INTEGER DEFAULT 0,
  total_tokens_bought INTEGER DEFAULT 0,
  first_tracked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_activity_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, wallet_address)
);

-- Offspring wallets discovered from mega whales (up to depth 4)
CREATE TABLE public.mega_whale_offspring (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mega_whale_id UUID NOT NULL REFERENCES public.mega_whales(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  depth_level INTEGER NOT NULL DEFAULT 1, -- 1 = direct, 2 = grandchild, etc. Max 4
  parent_offspring_id UUID REFERENCES public.mega_whale_offspring(id), -- For tracing chains
  first_funded_at TIMESTAMP WITH TIME ZONE,
  total_sol_received NUMERIC DEFAULT 0,
  is_pump_fun_dev BOOLEAN DEFAULT false,
  is_active_trader BOOLEAN DEFAULT false,
  tokens_minted JSONB DEFAULT '[]'::jsonb,
  tokens_bought JSONB DEFAULT '[]'::jsonb,
  tokens_sold JSONB DEFAULT '[]'::jsonb,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(mega_whale_id, wallet_address)
);

-- Token alerts from the mega whale network
CREATE TABLE public.mega_whale_token_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  mega_whale_id UUID NOT NULL REFERENCES public.mega_whales(id) ON DELETE CASCADE,
  offspring_id UUID REFERENCES public.mega_whale_offspring(id),
  alert_type TEXT NOT NULL, -- 'token_mint', 'token_buy', 'token_sell', 'pump_fun_interaction'
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  token_image TEXT,
  amount_sol NUMERIC,
  funding_chain JSONB, -- Path from mega whale to this event
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_mega_whales_user ON public.mega_whales(user_id);
CREATE INDEX idx_mega_whales_wallet ON public.mega_whales(wallet_address);
CREATE INDEX idx_mega_whale_offspring_whale ON public.mega_whale_offspring(mega_whale_id);
CREATE INDEX idx_mega_whale_offspring_wallet ON public.mega_whale_offspring(wallet_address);
CREATE INDEX idx_mega_whale_offspring_depth ON public.mega_whale_offspring(depth_level);
CREATE INDEX idx_mega_whale_alerts_user ON public.mega_whale_token_alerts(user_id);
CREATE INDEX idx_mega_whale_alerts_whale ON public.mega_whale_token_alerts(mega_whale_id);
CREATE INDEX idx_mega_whale_alerts_detected ON public.mega_whale_token_alerts(detected_at DESC);
CREATE INDEX idx_mega_whale_alerts_unread ON public.mega_whale_token_alerts(user_id, is_read) WHERE is_read = false;

-- Enable RLS
ALTER TABLE public.mega_whales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mega_whale_offspring ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mega_whale_token_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mega_whales
CREATE POLICY "Users can view their own mega whales"
ON public.mega_whales FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own mega whales"
ON public.mega_whales FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mega whales"
ON public.mega_whales FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mega whales"
ON public.mega_whales FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for mega_whale_offspring
CREATE POLICY "Users can view offspring of their mega whales"
ON public.mega_whale_offspring FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.mega_whales mw 
  WHERE mw.id = mega_whale_offspring.mega_whale_id 
  AND mw.user_id = auth.uid()
));

CREATE POLICY "Service role can manage offspring"
ON public.mega_whale_offspring FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies for mega_whale_token_alerts
CREATE POLICY "Users can view their own alerts"
ON public.mega_whale_token_alerts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
ON public.mega_whale_token_alerts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert alerts"
ON public.mega_whale_token_alerts FOR INSERT
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_mega_whales_updated_at
  BEFORE UPDATE ON public.mega_whales
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mega_whale_offspring_updated_at
  BEFORE UPDATE ON public.mega_whale_offspring
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();