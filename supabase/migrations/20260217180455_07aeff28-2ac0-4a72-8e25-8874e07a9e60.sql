-- Add loss review fields to fantasy positions
ALTER TABLE public.pumpfun_fantasy_positions
ADD COLUMN IF NOT EXISTS loss_tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS manual_loss_reason text;

-- Index for querying by tags
CREATE INDEX IF NOT EXISTS idx_pumpfun_fantasy_loss_tags ON public.pumpfun_fantasy_positions USING GIN(loss_tags) WHERE status = 'closed';