-- Create twitter_scanner_state table for tracking token scan rotation
CREATE TABLE public.twitter_scanner_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  last_scanned_at TIMESTAMPTZ,
  scan_count INTEGER NOT NULL DEFAULT 0,
  virality_score INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient token selection (virality_score DESC for priority ordering)
CREATE INDEX idx_twitter_scanner_state_priority 
ON public.twitter_scanner_state (virality_score DESC, last_scanned_at ASC NULLS FIRST);

-- Index for token lookups
CREATE INDEX idx_twitter_scanner_state_mint ON public.twitter_scanner_state (token_mint);

-- Add updated_at trigger
CREATE TRIGGER update_twitter_scanner_state_updated_at
BEFORE UPDATE ON public.twitter_scanner_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.twitter_scanner_state ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role full access to twitter_scanner_state"
ON public.twitter_scanner_state
FOR ALL
USING (true)
WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.twitter_scanner_state IS 'Tracks token scan rotation for Twitter scanner - one token per 16-minute cycle';