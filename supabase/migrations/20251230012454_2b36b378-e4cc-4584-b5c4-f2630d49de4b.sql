-- Add RugCheck fields to telegram_fantasy_positions
ALTER TABLE public.telegram_fantasy_positions
ADD COLUMN IF NOT EXISTS rugcheck_score integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rugcheck_normalised integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rugcheck_risks jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rugcheck_passed boolean DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rugcheck_checked_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS skip_reason text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.telegram_fantasy_positions.rugcheck_score IS 'Raw RugCheck.xyz score';
COMMENT ON COLUMN public.telegram_fantasy_positions.rugcheck_normalised IS 'Normalised 0-100 RugCheck score';
COMMENT ON COLUMN public.telegram_fantasy_positions.rugcheck_risks IS 'Array of risks detected by RugCheck';
COMMENT ON COLUMN public.telegram_fantasy_positions.rugcheck_passed IS 'Whether the token passed our RugCheck thresholds';
COMMENT ON COLUMN public.telegram_fantasy_positions.rugcheck_checked_at IS 'When RugCheck was performed';
COMMENT ON COLUMN public.telegram_fantasy_positions.skip_reason IS 'Reason why position was skipped (if applicable)';