-- 1. Add status tracking columns
ALTER TABLE public.telegram_insider_token_lifecycle
  ADD COLUMN IF NOT EXISTS creator_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS creator_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS creator_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kyc_label TEXT,
  ADD COLUMN IF NOT EXISTS kyc_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_attempts INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill creator_status from existing data
UPDATE public.telegram_insider_token_lifecycle
SET creator_status = 'resolved'
WHERE creator_wallet IS NOT NULL AND creator_status = 'unknown';

-- 3. Backfill kyc_status from existing genealogy data
UPDATE public.telegram_insider_token_lifecycle
SET kyc_status = 'kyc_resolved',
    kyc_last_attempt_at = COALESCE(enrichment_last_run_at, now())
WHERE genealogy_kyc_root IS NOT NULL AND kyc_status = 'pending';

-- 4. Indexes the orchestrator will use to pick the next batch quickly
CREATE INDEX IF NOT EXISTS idx_til_creator_status_attempts
  ON public.telegram_insider_token_lifecycle (creator_status, creator_last_attempt_at NULLS FIRST)
  WHERE creator_wallet IS NULL;

CREATE INDEX IF NOT EXISTS idx_til_kyc_status_attempts
  ON public.telegram_insider_token_lifecycle (kyc_status, kyc_last_attempt_at NULLS FIRST)
  WHERE creator_wallet IS NOT NULL AND kyc_status NOT IN ('kyc_resolved', 'no_kyc_reachable');

COMMENT ON COLUMN public.telegram_insider_token_lifecycle.creator_status IS 'unknown | resolving | resolved | unresolvable';
COMMENT ON COLUMN public.telegram_insider_token_lifecycle.kyc_status IS 'pending | tracing | kyc_resolved | no_kyc_reachable | failed';