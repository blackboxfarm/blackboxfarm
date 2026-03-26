-- Add phase column to token_socials_history
ALTER TABLE public.token_socials_history 
  ADD COLUMN IF NOT EXISTS phase text DEFAULT 'unknown';

-- Add lifecycle columns to token_social_links
ALTER TABLE public.token_social_links 
  ADD COLUMN IF NOT EXISTS is_current boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS phase text DEFAULT 'discovery';

-- Index for querying current links
CREATE INDEX IF NOT EXISTS idx_token_social_links_current 
  ON public.token_social_links(token_mint, is_current) WHERE is_current = true;

-- Index for phase queries on history
CREATE INDEX IF NOT EXISTS idx_token_socials_history_phase 
  ON public.token_socials_history(token_mint, phase);