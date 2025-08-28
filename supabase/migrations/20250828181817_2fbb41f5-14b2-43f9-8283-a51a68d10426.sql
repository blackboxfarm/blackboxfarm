-- Create BumpBot specific tables
CREATE TABLE public.blackbox_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT,
  two_factor_secret TEXT,
  two_factor_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.blackbox_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  token_address TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.blackbox_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.blackbox_campaigns(id) ON DELETE CASCADE,
  pubkey TEXT NOT NULL,
  secret_key_encrypted TEXT NOT NULL,
  sol_balance NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.blackbox_command_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES public.blackbox_wallets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.blackbox_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES public.blackbox_wallets(id) ON DELETE CASCADE,
  command_code_id UUID REFERENCES public.blackbox_command_codes(id),
  transaction_type TEXT NOT NULL, -- 'buy' or 'sell'
  amount_sol NUMERIC NOT NULL,
  gas_fee NUMERIC NOT NULL,
  service_fee NUMERIC NOT NULL,
  signature TEXT,
  status TEXT DEFAULT 'pending',
  executed_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blackbox_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackbox_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackbox_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackbox_command_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackbox_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their blackbox profile" 
ON public.blackbox_users 
FOR ALL 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their campaigns" 
ON public.blackbox_campaigns 
FOR ALL 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view wallets from their campaigns" 
ON public.blackbox_wallets 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.blackbox_campaigns 
  WHERE id = blackbox_wallets.campaign_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can manage command codes from their wallets" 
ON public.blackbox_command_codes 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.blackbox_wallets bw
  JOIN public.blackbox_campaigns bc ON bw.campaign_id = bc.id
  WHERE bw.id = blackbox_command_codes.wallet_id 
  AND bc.user_id = auth.uid()
));

CREATE POLICY "Users can view transactions from their wallets" 
ON public.blackbox_transactions 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.blackbox_wallets bw
  JOIN public.blackbox_campaigns bc ON bw.campaign_id = bc.id
  WHERE bw.id = blackbox_transactions.wallet_id 
  AND bc.user_id = auth.uid()
));

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_blackbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_blackbox_users_updated_at
  BEFORE UPDATE ON public.blackbox_users
  FOR EACH ROW EXECUTE FUNCTION update_blackbox_updated_at();

CREATE TRIGGER update_blackbox_campaigns_updated_at
  BEFORE UPDATE ON public.blackbox_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_blackbox_updated_at();

CREATE TRIGGER update_blackbox_wallets_updated_at
  BEFORE UPDATE ON public.blackbox_wallets
  FOR EACH ROW EXECUTE FUNCTION update_blackbox_updated_at();

CREATE TRIGGER update_blackbox_command_codes_updated_at
  BEFORE UPDATE ON public.blackbox_command_codes
  FOR EACH ROW EXECUTE FUNCTION update_blackbox_updated_at();