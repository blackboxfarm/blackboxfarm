-- Create table for wallets to monitor
CREATE TABLE public.monitored_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  wallet_address TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, wallet_address)
);

-- Create table for wallet transactions
CREATE TABLE public.wallet_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  monitored_wallet_id UUID NOT NULL REFERENCES public.monitored_wallets(id) ON DELETE CASCADE,
  signature TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL, -- 'buy' or 'sell'
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  amount_sol NUMERIC NOT NULL,
  amount_usd NUMERIC,
  platform TEXT, -- 'raydium', 'pump.fun', 'jupiter', etc.
  is_first_purchase BOOLEAN NOT NULL DEFAULT false,
  meets_criteria BOOLEAN NOT NULL DEFAULT false, -- new + >$1000 + raydium
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.monitored_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies for monitored_wallets
CREATE POLICY "Users can manage their own monitored wallets" 
ON public.monitored_wallets 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create policies for wallet_transactions
CREATE POLICY "Users can view transactions for their monitored wallets" 
ON public.wallet_transactions 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.monitored_wallets 
  WHERE id = wallet_transactions.monitored_wallet_id 
  AND user_id = auth.uid()
));

-- Create indexes for performance
CREATE INDEX idx_wallet_transactions_monitored_wallet_id ON public.wallet_transactions(monitored_wallet_id);
CREATE INDEX idx_wallet_transactions_timestamp ON public.wallet_transactions(timestamp DESC);
CREATE INDEX idx_wallet_transactions_meets_criteria ON public.wallet_transactions(meets_criteria) WHERE meets_criteria = true;

-- Create trigger for updated_at
CREATE TRIGGER update_monitored_wallets_updated_at
  BEFORE UPDATE ON public.monitored_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add realtime support
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;
ALTER TABLE public.wallet_transactions REPLICA IDENTITY FULL;