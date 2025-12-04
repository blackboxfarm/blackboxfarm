-- Create fantasy_trades table for paper trading
CREATE TABLE public.fantasy_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  frenzy_event_id UUID REFERENCES public.whale_frenzy_events(id),
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  entry_price_sol NUMERIC NOT NULL,
  entry_amount_sol NUMERIC NOT NULL DEFAULT 1,
  entry_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  current_price_sol NUMERIC,
  unrealized_pnl_sol NUMERIC DEFAULT 0,
  unrealized_pnl_percent NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  exit_price_sol NUMERIC,
  exit_timestamp TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fantasy_trades ENABLE ROW LEVEL SECURITY;

-- RLS policy for fantasy_trades
CREATE POLICY "Users can manage their own fantasy trades"
ON public.fantasy_trades
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add columns to whale_frenzy_events for timeline tracking
ALTER TABLE public.whale_frenzy_events 
ADD COLUMN IF NOT EXISTS buy_timeline JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS entry_token_price NUMERIC;

-- Add fantasy mode columns to whale_frenzy_config
ALTER TABLE public.whale_frenzy_config
ADD COLUMN IF NOT EXISTS fantasy_mode BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS fantasy_buy_amount NUMERIC DEFAULT 1;

-- Create index for faster queries
CREATE INDEX idx_fantasy_trades_user_status ON public.fantasy_trades(user_id, status);
CREATE INDEX idx_fantasy_trades_token ON public.fantasy_trades(token_mint);
CREATE INDEX idx_whale_frenzy_events_timeline ON public.whale_frenzy_events USING GIN(buy_timeline);