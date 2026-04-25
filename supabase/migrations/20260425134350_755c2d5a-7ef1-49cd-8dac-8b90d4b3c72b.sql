ALTER TABLE public.telegram_insider_token_lifecycle
  ADD COLUMN IF NOT EXISTS genealogy_chain jsonb;

CREATE INDEX IF NOT EXISTS idx_lifecycle_kyc_root
  ON public.telegram_insider_token_lifecycle (genealogy_kyc_root)
  WHERE genealogy_kyc_root IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lifecycle_creator
  ON public.telegram_insider_token_lifecycle (creator_wallet)
  WHERE creator_wallet IS NOT NULL;