-- Track C: Intent classification dimension for Token Projects.
-- Separate from death_cause (failure-only). Captures intent across the full
-- success/failure spectrum.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'token_intent_classification') THEN
    CREATE TYPE public.token_intent_classification AS ENUM (
      'rug_pull',
      'soft_rug',
      'abandoned',
      'accidental_failure',
      'organic_success',
      'engineered_success',
      'unknown'
    );
  END IF;
END
$$;

ALTER TABLE public.token_lifecycle
  ADD COLUMN IF NOT EXISTS intent_classification public.token_intent_classification
    NOT NULL DEFAULT 'unknown';

ALTER TABLE public.token_lifecycle
  ADD COLUMN IF NOT EXISTS intent_classified_at TIMESTAMPTZ;

ALTER TABLE public.token_lifecycle
  ADD COLUMN IF NOT EXISTS intent_classification_source TEXT;

CREATE INDEX IF NOT EXISTS idx_token_lifecycle_intent
  ON public.token_lifecycle (intent_classification);

COMMENT ON COLUMN public.token_lifecycle.intent_classification IS
  'Reputation Engine: WHY this token ended up where it did. rug_pull/soft_rug/abandoned imply creator culpability; organic_success/engineered_success imply positive reputation; accidental_failure is no-fault. Set by token-autopsy and allstar-promotion-engine.';
