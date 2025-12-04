-- Add launcher scoring fields to mega_whale_offspring
ALTER TABLE public.mega_whale_offspring 
ADD COLUMN IF NOT EXISTS launcher_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_monitored BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS score_factors JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS has_minted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS minted_token TEXT;

-- Create index for efficient monitoring queries
CREATE INDEX IF NOT EXISTS idx_offspring_monitored ON public.mega_whale_offspring(is_monitored) WHERE is_monitored = true;
CREATE INDEX IF NOT EXISTS idx_offspring_launcher_score ON public.mega_whale_offspring(launcher_score DESC);

-- Create mint alerts table
CREATE TABLE IF NOT EXISTS public.mega_whale_mint_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  offspring_id UUID REFERENCES public.mega_whale_offspring(id),
  mega_whale_id UUID REFERENCES public.mega_whales(id),
  minter_wallet TEXT NOT NULL,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  launcher_score INTEGER,
  funding_chain JSONB DEFAULT '[]',
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  auto_buy_triggered BOOLEAN DEFAULT false,
  auto_buy_tx TEXT,
  auto_buy_amount_sol NUMERIC,
  auto_buy_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mega_whale_mint_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for mint alerts
CREATE POLICY "Users can view their whale mint alerts" ON public.mega_whale_mint_alerts
FOR SELECT USING (
  mega_whale_id IN (SELECT id FROM public.mega_whales WHERE user_id = auth.uid())
);

-- Create auto-buy wallet table (dedicated wallets for auto-buying mints)
CREATE TABLE IF NOT EXISTS public.mega_whale_auto_buy_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pubkey TEXT NOT NULL UNIQUE,
  secret_key_encrypted TEXT NOT NULL,
  sol_balance NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  total_buys INTEGER DEFAULT 0,
  total_sol_spent NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mega_whale_auto_buy_wallets ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can manage their auto-buy wallets" ON public.mega_whale_auto_buy_wallets
FOR ALL USING (user_id = auth.uid());

-- Create auto-buy config table
CREATE TABLE IF NOT EXISTS public.mega_whale_auto_buy_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT false,
  min_launcher_score INTEGER DEFAULT 70,
  buy_amount_sol NUMERIC DEFAULT 0.1,
  max_daily_buys INTEGER DEFAULT 10,
  buys_today INTEGER DEFAULT 0,
  last_buy_reset TIMESTAMP WITH TIME ZONE DEFAULT now(),
  slippage_bps INTEGER DEFAULT 1500,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mega_whale_auto_buy_config ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can manage their auto-buy config" ON public.mega_whale_auto_buy_config
FOR ALL USING (user_id = auth.uid());

-- Function to reset daily buy counts
CREATE OR REPLACE FUNCTION public.reset_daily_auto_buy_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE mega_whale_auto_buy_config
  SET buys_today = 0, last_buy_reset = now()
  WHERE last_buy_reset < CURRENT_DATE;
END;
$$;