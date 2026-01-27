-- Create token_ai_interpretations table for caching AI analysis
CREATE TABLE public.token_ai_interpretations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  interpretation JSONB NOT NULL,
  commentary_mode TEXT NOT NULL DEFAULT 'snapshot',
  metrics_snapshot JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient cache lookups
CREATE INDEX idx_tai_mint_expires ON public.token_ai_interpretations(token_mint, expires_at);

-- Enable Row Level Security
ALTER TABLE public.token_ai_interpretations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Public read (interpretations are non-sensitive), edge functions can insert
CREATE POLICY "Anyone can read interpretations" 
ON public.token_ai_interpretations 
FOR SELECT 
USING (true);

CREATE POLICY "Service role can insert interpretations" 
ON public.token_ai_interpretations 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service role can delete expired interpretations" 
ON public.token_ai_interpretations 
FOR DELETE 
USING (true);