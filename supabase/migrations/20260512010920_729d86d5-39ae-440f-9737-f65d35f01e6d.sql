ALTER TABLE public.developer_profiles
  ADD COLUMN IF NOT EXISTS kyc_root_wallet text,
  ADD COLUMN IF NOT EXISTS kyc_root_label text;

CREATE INDEX IF NOT EXISTS idx_developer_profiles_kyc_root_wallet
  ON public.developer_profiles (kyc_root_wallet)
  WHERE kyc_root_wallet IS NOT NULL;