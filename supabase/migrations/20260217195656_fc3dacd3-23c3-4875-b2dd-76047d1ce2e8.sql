-- Add rehabilitation and creator columns to pumpfun_fantasy_positions
ALTER TABLE public.pumpfun_fantasy_positions
  ADD COLUMN IF NOT EXISTS creator_wallet text,
  ADD COLUMN IF NOT EXISTS rehabilitation_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS rehabilitated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rehabilitated_by text;

-- Index for rehab review queries
CREATE INDEX IF NOT EXISTS idx_fantasy_positions_rehab_status
  ON public.pumpfun_fantasy_positions (rehabilitation_status)
  WHERE rehabilitation_status = 'pending_review';