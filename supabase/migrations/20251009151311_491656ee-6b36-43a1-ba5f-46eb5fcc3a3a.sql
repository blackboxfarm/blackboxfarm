-- Create kol_wallets table to track wallets with verified Twitter/X profiles
CREATE TABLE public.kol_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  twitter_handle TEXT NOT NULL,
  sns_name TEXT,
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kol_wallets ENABLE ROW LEVEL SECURITY;

-- Public read access for KOL directory features
CREATE POLICY "KOL wallets are publicly readable"
ON public.kol_wallets
FOR SELECT
USING (true);

-- Service role can manage KOL records
CREATE POLICY "Service role can manage KOL wallets"
ON public.kol_wallets
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create indexes for performance
CREATE INDEX idx_kol_wallets_address ON public.kol_wallets(wallet_address);
CREATE INDEX idx_kol_wallets_active ON public.kol_wallets(is_active) WHERE is_active = true;
CREATE INDEX idx_kol_wallets_twitter ON public.kol_wallets(twitter_handle);

-- Trigger for updated_at
CREATE TRIGGER update_kol_wallets_updated_at
BEFORE UPDATE ON public.kol_wallets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();