-- Add reconciliation/drift tracking columns to flip_positions
ALTER TABLE public.flip_positions
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS needs_reconciliation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ghost_position BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_chain_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_program TEXT;

-- Index for the drift sentinel scan
CREATE INDEX IF NOT EXISTS idx_flip_positions_holding_sync
  ON public.flip_positions (status, last_chain_sync_at)
  WHERE status = 'holding';

-- Index for surfacing flagged positions in dashboard
CREATE INDEX IF NOT EXISTS idx_flip_positions_flags
  ON public.flip_positions (needs_reconciliation, ghost_position)
  WHERE status = 'holding' AND (needs_reconciliation = true OR ghost_position = true);