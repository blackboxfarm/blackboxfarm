-- Add new columns for bundle analysis to token_mint_watchdog
ALTER TABLE public.token_mint_watchdog 
ADD COLUMN IF NOT EXISTS metadata jsonb,
ADD COLUMN IF NOT EXISTS bundle_analysis jsonb,
ADD COLUMN IF NOT EXISTS first_buyers jsonb,
ADD COLUMN IF NOT EXISTS is_bundled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS bundle_score integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS analyzed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS discovery_triggered boolean DEFAULT false;

-- Add index for quick lookups on bundled tokens
CREATE INDEX IF NOT EXISTS idx_token_watchdog_bundled ON public.token_mint_watchdog(is_bundled) WHERE is_bundled = true;
CREATE INDEX IF NOT EXISTS idx_token_watchdog_score ON public.token_mint_watchdog(bundle_score DESC);