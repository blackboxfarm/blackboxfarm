-- Create table for airdrop master wallets
CREATE TABLE public.airdrop_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT,
  pubkey TEXT NOT NULL UNIQUE,
  secret_key_encrypted TEXT NOT NULL,
  sol_balance NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Create table for airdrop history
CREATE TABLE public.airdrop_distributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.airdrop_wallets(id) ON DELETE CASCADE,
  token_mint TEXT NOT NULL,
  amount_per_wallet NUMERIC NOT NULL,
  memo TEXT,
  recipient_count INTEGER NOT NULL,
  recipients JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  transaction_signatures JSONB
);

-- Enable RLS
ALTER TABLE public.airdrop_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airdrop_distributions ENABLE ROW LEVEL SECURITY;

-- RLS policies for airdrop_wallets (super admin only)
CREATE POLICY "Super admins can manage airdrop wallets"
ON public.airdrop_wallets
FOR ALL
USING (public.is_super_admin(auth.uid()));

-- RLS policies for airdrop_distributions (super admin only)
CREATE POLICY "Super admins can manage airdrop distributions"
ON public.airdrop_distributions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.airdrop_wallets aw
    WHERE aw.id = airdrop_distributions.wallet_id
    AND public.is_super_admin(auth.uid())
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_airdrop_wallets_updated_at
BEFORE UPDATE ON public.airdrop_wallets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Encryption trigger for wallet secrets
CREATE TRIGGER encrypt_airdrop_wallet_secrets
BEFORE INSERT OR UPDATE ON public.airdrop_wallets
FOR EACH ROW
EXECUTE FUNCTION public.encrypt_blackbox_wallet_secrets_trigger();