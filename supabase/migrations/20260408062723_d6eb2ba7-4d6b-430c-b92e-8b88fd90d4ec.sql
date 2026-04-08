
ALTER TABLE public.token_lifecycle
  ADD COLUMN IF NOT EXISTS death_cause text,
  ADD COLUMN IF NOT EXISTS death_confidence integer,
  ADD COLUMN IF NOT EXISTS autopsy_at timestamptz,
  ADD COLUMN IF NOT EXISTS autopsy_notes text;

CREATE INDEX IF NOT EXISTS idx_token_lifecycle_death_cause ON public.token_lifecycle (death_cause);
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_autopsy_at ON public.token_lifecycle (autopsy_at);
