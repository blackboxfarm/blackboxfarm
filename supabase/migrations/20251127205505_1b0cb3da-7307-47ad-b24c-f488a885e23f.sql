-- Create airdrop_configs table for saved airdrop configurations
CREATE TABLE public.airdrop_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.airdrop_wallets(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Airdrop',
  token_mint TEXT NOT NULL,
  amount_per_wallet NUMERIC NOT NULL,
  memo TEXT,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked', 'executed')),
  execution_count INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add is_archived column to airdrop_wallets for soft delete
ALTER TABLE public.airdrop_wallets ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Add config_id to airdrop_distributions to link executions to configs
ALTER TABLE public.airdrop_distributions ADD COLUMN IF NOT EXISTS config_id UUID REFERENCES public.airdrop_configs(id);

-- Enable RLS on airdrop_configs
ALTER TABLE public.airdrop_configs ENABLE ROW LEVEL SECURITY;

-- RLS policy for airdrop_configs
CREATE POLICY "Super admins can manage airdrop configs"
ON public.airdrop_configs
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM airdrop_wallets aw
    WHERE aw.id = airdrop_configs.wallet_id
    AND is_super_admin(auth.uid())
  )
);

-- Create trigger for updated_at on airdrop_configs
CREATE TRIGGER update_airdrop_configs_updated_at
BEFORE UPDATE ON public.airdrop_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();