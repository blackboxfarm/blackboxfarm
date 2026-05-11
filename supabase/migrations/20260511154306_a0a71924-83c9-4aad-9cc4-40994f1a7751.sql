-- Broaden KYC label model: bridges, on-ramps, aggregators, MM desks count as KYC origin
ALTER TABLE public.known_cex_wallets
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'cex';

CREATE INDEX IF NOT EXISTS idx_known_cex_wallets_entity_type ON public.known_cex_wallets(entity_type);

ALTER TABLE public.developer_profiles
  ADD COLUMN IF NOT EXISTS kyc_source_type text,
  ADD COLUMN IF NOT EXISTS kyc_trail_status text;

CREATE INDEX IF NOT EXISTS idx_dev_profiles_kyc_trail_status ON public.developer_profiles(kyc_trail_status);
CREATE INDEX IF NOT EXISTS idx_dev_profiles_kyc_source_type ON public.developer_profiles(kyc_source_type);

-- Backfill: any verified row inherits 'cex' source type and 'verified' trail status
UPDATE public.developer_profiles
   SET kyc_source_type = 'cex',
       kyc_trail_status = 'verified'
 WHERE kyc_verified = true AND kyc_trail_status IS NULL;