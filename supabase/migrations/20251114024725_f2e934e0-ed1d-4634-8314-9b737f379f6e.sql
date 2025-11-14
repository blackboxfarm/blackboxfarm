-- Create wallet_chains table for organizing wallet hierarchies
CREATE TABLE public.wallet_chains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  parent_wallet_id UUID REFERENCES public.blackbox_wallets(id) ON DELETE SET NULL,
  child_1_wallet_id UUID REFERENCES public.blackbox_wallets(id) ON DELETE SET NULL,
  child_2_wallet_id UUID REFERENCES public.blackbox_wallets(id) ON DELETE SET NULL,
  child_3_wallet_id UUID REFERENCES public.blackbox_wallets(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wallet_chains ENABLE ROW LEVEL SECURITY;

-- Users can manage their own chains
CREATE POLICY "Users can manage their own wallet chains"
ON public.wallet_chains
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create index for user lookups
CREATE INDEX idx_wallet_chains_user_id ON public.wallet_chains(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_wallet_chains_updated_at
BEFORE UPDATE ON public.wallet_chains
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();