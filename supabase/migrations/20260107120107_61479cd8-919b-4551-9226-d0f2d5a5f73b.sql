-- Blacklist entries table for tracking bad actors across the mesh
CREATE TABLE public.pumpfun_blacklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('dev_wallet', 'mint_wallet', 'funding_wallet', 'suspicious_wallet', 'pumpfun_account', 'twitter_account', 'telegram_account', 'kyc_wallet')),
  identifier TEXT NOT NULL,
  -- Cross-links to related entities
  linked_token_mints TEXT[] DEFAULT '{}',
  linked_wallets TEXT[] DEFAULT '{}',
  linked_twitter TEXT[] DEFAULT '{}',
  linked_telegram TEXT[] DEFAULT '{}',
  linked_pumpfun_accounts TEXT[] DEFAULT '{}',
  -- Classification
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  blacklist_reason TEXT,
  tags TEXT[] DEFAULT '{}',
  -- Evidence & tracking
  evidence_notes TEXT,
  first_seen_at TIMESTAMPTZ,
  tokens_rugged INTEGER DEFAULT 0,
  total_victims INTEGER DEFAULT 0,
  total_stolen_sol NUMERIC DEFAULT 0,
  -- Metadata
  source TEXT DEFAULT 'manual', -- manual, auto_detected, imported
  added_by TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX idx_pumpfun_blacklist_identifier ON public.pumpfun_blacklist(identifier);
CREATE INDEX idx_pumpfun_blacklist_entry_type ON public.pumpfun_blacklist(entry_type);
CREATE INDEX idx_pumpfun_blacklist_risk_level ON public.pumpfun_blacklist(risk_level);
CREATE INDEX idx_pumpfun_blacklist_is_active ON public.pumpfun_blacklist(is_active);

-- GIN indexes for array searches (find connections)
CREATE INDEX idx_pumpfun_blacklist_linked_wallets ON public.pumpfun_blacklist USING GIN(linked_wallets);
CREATE INDEX idx_pumpfun_blacklist_linked_tokens ON public.pumpfun_blacklist USING GIN(linked_token_mints);
CREATE INDEX idx_pumpfun_blacklist_linked_twitter ON public.pumpfun_blacklist USING GIN(linked_twitter);
CREATE INDEX idx_pumpfun_blacklist_tags ON public.pumpfun_blacklist USING GIN(tags);

-- Enable RLS
ALTER TABLE public.pumpfun_blacklist ENABLE ROW LEVEL SECURITY;

-- RLS policies - super admins only
CREATE POLICY "Super admins can view blacklist" 
ON public.pumpfun_blacklist 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "Super admins can manage blacklist" 
ON public.pumpfun_blacklist 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_pumpfun_blacklist_updated_at
BEFORE UPDATE ON public.pumpfun_blacklist
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();