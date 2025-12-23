-- Create flip_positions table for tracking quick token flips
CREATE TABLE public.flip_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES super_admin_wallets(id) ON DELETE SET NULL,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  
  -- Buy details
  buy_amount_usd NUMERIC DEFAULT 10,
  buy_price_usd NUMERIC,
  quantity_tokens NUMERIC,
  buy_signature TEXT,
  buy_executed_at TIMESTAMPTZ,
  
  -- Sell target
  target_multiplier NUMERIC DEFAULT 2, -- 2x or 3x
  target_price_usd NUMERIC,
  
  -- Sell details (when executed)
  sell_price_usd NUMERIC,
  sell_signature TEXT,
  sell_executed_at TIMESTAMPTZ,
  profit_usd NUMERIC,
  
  -- Status tracking
  status TEXT DEFAULT 'pending_buy', -- pending_buy, holding, pending_sell, sold, failed
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flip_positions ENABLE ROW LEVEL SECURITY;

-- Super admins only policies
CREATE POLICY "Super admins can view all flip positions"
ON public.flip_positions FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert flip positions"
ON public.flip_positions FOR INSERT
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update flip positions"
ON public.flip_positions FOR UPDATE
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete flip positions"
ON public.flip_positions FOR DELETE
USING (public.is_super_admin(auth.uid()));

-- Create index for efficient querying
CREATE INDEX idx_flip_positions_status ON public.flip_positions(status);
CREATE INDEX idx_flip_positions_user_id ON public.flip_positions(user_id);
CREATE INDEX idx_flip_positions_token_mint ON public.flip_positions(token_mint);

-- Trigger for updated_at
CREATE TRIGGER update_flip_positions_updated_at
BEFORE UPDATE ON public.flip_positions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();