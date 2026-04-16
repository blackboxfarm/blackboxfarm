-- Add LP Reclaimed Position Tracking columns to flip_positions
ALTER TABLE public.flip_positions
  ADD COLUMN IF NOT EXISTS position_source TEXT NOT NULL DEFAULT 'buy',
  ADD COLUMN IF NOT EXISTS lp_pool_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS lp_withdrawal_signature TEXT NULL;

-- Add a check constraint for valid position_source values
ALTER TABLE public.flip_positions
  DROP CONSTRAINT IF EXISTS flip_positions_position_source_check;
ALTER TABLE public.flip_positions
  ADD CONSTRAINT flip_positions_position_source_check
  CHECK (position_source IN ('buy', 'lp_reclaimed', 'manual'));

-- Unique index to prevent double-import of the same LP withdrawal tx
CREATE UNIQUE INDEX IF NOT EXISTS flip_positions_lp_withdrawal_signature_uniq
  ON public.flip_positions (lp_withdrawal_signature)
  WHERE lp_withdrawal_signature IS NOT NULL;

-- Index for filtering by position source
CREATE INDEX IF NOT EXISTS flip_positions_position_source_idx
  ON public.flip_positions (position_source);