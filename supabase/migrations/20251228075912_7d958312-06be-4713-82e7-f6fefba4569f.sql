-- Create flip_limit_orders table for queued limit buy orders
CREATE TABLE public.flip_limit_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  wallet_id UUID,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  buy_price_min_usd NUMERIC NOT NULL,
  buy_price_max_usd NUMERIC NOT NULL,
  buy_amount_sol NUMERIC NOT NULL,
  target_multiplier NUMERIC NOT NULL DEFAULT 2.0,
  slippage_bps INTEGER NOT NULL DEFAULT 1000,
  priority_fee_mode TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'watching',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE,
  executed_position_id UUID REFERENCES flip_positions(id),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  notification_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_price_range CHECK (buy_price_max_usd >= buy_price_min_usd),
  CONSTRAINT valid_status CHECK (status IN ('watching', 'executed', 'cancelled', 'expired'))
);

-- Enable RLS
ALTER TABLE public.flip_limit_orders ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own limit orders"
ON public.flip_limit_orders
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own limit orders"
ON public.flip_limit_orders
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own limit orders"
ON public.flip_limit_orders
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own limit orders"
ON public.flip_limit_orders
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for monitoring
CREATE INDEX idx_flip_limit_orders_watching ON public.flip_limit_orders(status, expires_at) WHERE status = 'watching';
CREATE INDEX idx_flip_limit_orders_token ON public.flip_limit_orders(token_mint, status);

-- Create trigger for updated_at
CREATE TRIGGER update_flip_limit_orders_updated_at
BEFORE UPDATE ON public.flip_limit_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();