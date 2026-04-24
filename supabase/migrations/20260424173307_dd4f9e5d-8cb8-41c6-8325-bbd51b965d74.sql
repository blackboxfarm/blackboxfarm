ALTER TABLE public.telegram_insider_token_lifecycle
  ADD COLUMN IF NOT EXISTS socials_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS socials_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS socials_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_status text,
  ADD COLUMN IF NOT EXISTS launchpad text,
  ADD COLUMN IF NOT EXISTS genealogy_depth integer,
  ADD COLUMN IF NOT EXISTS genealogy_kyc_root text;

CREATE INDEX IF NOT EXISTS idx_insider_lifecycle_enrichment_run
  ON public.telegram_insider_token_lifecycle (enrichment_last_run_at NULLS FIRST, peak_multiplier DESC);

CREATE INDEX IF NOT EXISTS idx_insider_lifecycle_socials_check
  ON public.telegram_insider_token_lifecycle (socials_last_checked_at NULLS FIRST);