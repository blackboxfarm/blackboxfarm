-- Add fantasy mode columns to telegram_channel_config
ALTER TABLE public.telegram_channel_config 
ADD COLUMN IF NOT EXISTS fantasy_mode boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS fantasy_buy_amount_usd numeric DEFAULT 100;

-- Create telegram_message_interpretations table for AI interpretation log
CREATE TABLE IF NOT EXISTS public.telegram_message_interpretations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_config_id uuid REFERENCES public.telegram_channel_config(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  message_id bigint NOT NULL,
  raw_message text,
  ai_summary text NOT NULL,
  ai_interpretation text NOT NULL,
  extracted_tokens text[] DEFAULT '{}',
  decision text NOT NULL CHECK (decision IN ('buy', 'fantasy_buy', 'skip', 'no_action')),
  decision_reasoning text NOT NULL,
  confidence_score numeric DEFAULT 0.5,
  token_mint text,
  token_symbol text,
  price_at_detection numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create telegram_fantasy_positions table for fantasy trading
CREATE TABLE IF NOT EXISTS public.telegram_fantasy_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_config_id uuid REFERENCES public.telegram_channel_config(id) ON DELETE CASCADE,
  call_id uuid REFERENCES public.telegram_channel_calls(id) ON DELETE SET NULL,
  interpretation_id uuid REFERENCES public.telegram_message_interpretations(id) ON DELETE SET NULL,
  user_id uuid,
  token_mint text NOT NULL,
  token_symbol text,
  token_name text,
  entry_price_usd numeric NOT NULL,
  entry_amount_usd numeric NOT NULL DEFAULT 100,
  token_amount numeric,
  current_price_usd numeric,
  unrealized_pnl_usd numeric DEFAULT 0,
  unrealized_pnl_percent numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'sold')),
  sold_at timestamp with time zone,
  sold_price_usd numeric,
  realized_pnl_usd numeric,
  realized_pnl_percent numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.telegram_message_interpretations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_fantasy_positions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role full access to interpretations"
ON public.telegram_message_interpretations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access to fantasy positions"
ON public.telegram_fantasy_positions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow authenticated users to view (admin check done in app)
CREATE POLICY "Authenticated can view interpretations"
ON public.telegram_message_interpretations
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can view fantasy positions"
ON public.telegram_fantasy_positions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can manage fantasy positions"
ON public.telegram_fantasy_positions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_telegram_interpretations_channel ON public.telegram_message_interpretations(channel_id);
CREATE INDEX IF NOT EXISTS idx_telegram_interpretations_created ON public.telegram_message_interpretations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_fantasy_positions_status ON public.telegram_fantasy_positions(status);
CREATE INDEX IF NOT EXISTS idx_telegram_fantasy_positions_token ON public.telegram_fantasy_positions(token_mint);

-- Create updated_at trigger for fantasy positions
CREATE OR REPLACE FUNCTION public.update_telegram_fantasy_positions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_telegram_fantasy_positions_updated_at ON public.telegram_fantasy_positions;
CREATE TRIGGER update_telegram_fantasy_positions_updated_at
  BEFORE UPDATE ON public.telegram_fantasy_positions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_telegram_fantasy_positions_updated_at();