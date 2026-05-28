ALTER TABLE public.telegram_insider_token_lifecycle
  ADD COLUMN IF NOT EXISTS ingest_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ingest_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingest_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingest_last_error text,
  ADD COLUMN IF NOT EXISTS dev_wallet_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS mesh_hydrated_at timestamptz,
  ADD COLUMN IF NOT EXISTS holders_refreshed_at timestamptz,
  ADD COLUMN IF NOT EXISTS blackbox_harvested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_til_ingest_status ON public.telegram_insider_token_lifecycle (ingest_status);