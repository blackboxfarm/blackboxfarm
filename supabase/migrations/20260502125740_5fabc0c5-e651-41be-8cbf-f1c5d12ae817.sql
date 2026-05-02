ALTER TABLE public.autopsy_candidates
  ADD COLUMN IF NOT EXISTS hydration_status jsonb,
  ADD COLUMN IF NOT EXISTS hydrated_at timestamptz,
  ADD COLUMN IF NOT EXISTS hydration_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_autopsy_candidates_token_mint
  ON public.autopsy_candidates (token_mint);