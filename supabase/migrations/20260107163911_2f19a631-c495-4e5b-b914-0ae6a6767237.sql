-- Pump.fun Whitelist Mesh - Trusted devs, wallets, and accounts
CREATE TABLE public.pumpfun_whitelist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('dev_wallet', 'mint_wallet', 'funding_wallet', 'trusted_wallet', 'pumpfun_account', 'twitter_account', 'telegram_account', 'kyc_wallet')),
  identifier TEXT NOT NULL,
  linked_token_mints TEXT[] DEFAULT '{}',
  linked_wallets TEXT[] DEFAULT '{}',
  linked_twitter TEXT[] DEFAULT '{}',
  linked_telegram TEXT[] DEFAULT '{}',
  linked_pumpfun_accounts TEXT[] DEFAULT '{}',
  trust_level TEXT NOT NULL DEFAULT 'medium' CHECK (trust_level IN ('low', 'medium', 'high', 'verified')),
  whitelist_reason TEXT,
  tags TEXT[] DEFAULT '{}',
  evidence_notes TEXT,
  first_seen_at TIMESTAMPTZ,
  tokens_launched INTEGER DEFAULT 0,
  tokens_successful INTEGER DEFAULT 0,
  avg_token_lifespan_hours NUMERIC DEFAULT 0,
  total_volume_sol NUMERIC DEFAULT 0,
  source TEXT DEFAULT 'manual',
  added_by UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entry_type, identifier)
);

-- Enable RLS
ALTER TABLE public.pumpfun_whitelist ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users (needed for monitor to check)
CREATE POLICY "Authenticated users can read whitelist" 
  ON public.pumpfun_whitelist FOR SELECT 
  TO authenticated USING (true);

-- Full access for super admins 
CREATE POLICY "Super admins can manage whitelist" 
  ON public.pumpfun_whitelist FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.super_admin_wallets 
      WHERE is_active = true
    )
  );

-- Index for fast lookups
CREATE INDEX idx_pumpfun_whitelist_identifier ON public.pumpfun_whitelist(identifier);
CREATE INDEX idx_pumpfun_whitelist_entry_type ON public.pumpfun_whitelist(entry_type);
CREATE INDEX idx_pumpfun_whitelist_linked_wallets ON public.pumpfun_whitelist USING GIN(linked_wallets);
CREATE INDEX idx_pumpfun_whitelist_linked_token_mints ON public.pumpfun_whitelist USING GIN(linked_token_mints);

-- Trigger for updated_at
CREATE TRIGGER update_pumpfun_whitelist_updated_at
  BEFORE UPDATE ON public.pumpfun_whitelist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();