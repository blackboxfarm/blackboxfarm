-- Create holders_intel_dex_triggers table to track DEX milestone events
CREATE TABLE public.holders_intel_dex_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  trigger_type TEXT NOT NULL, -- 'dex_paid', 'cto', 'boost_50', 'boost_100', 'ads'
  detected_at TIMESTAMPTZ DEFAULT now(),
  posted_at TIMESTAMPTZ,
  queue_id UUID REFERENCES public.holders_intel_post_queue(id),
  boost_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(token_mint, trigger_type)
);

-- Create index for efficient lookups
CREATE INDEX idx_dex_triggers_token_mint ON public.holders_intel_dex_triggers(token_mint);
CREATE INDEX idx_dex_triggers_trigger_type ON public.holders_intel_dex_triggers(trigger_type);
CREATE INDEX idx_dex_triggers_detected_at ON public.holders_intel_dex_triggers(detected_at DESC);

-- Add trigger_comment column to holders_intel_post_queue
ALTER TABLE public.holders_intel_post_queue 
ADD COLUMN IF NOT EXISTS trigger_comment TEXT;

-- Add trigger_source column to track where the queue item came from
ALTER TABLE public.holders_intel_post_queue 
ADD COLUMN IF NOT EXISTS trigger_source TEXT DEFAULT 'scheduler';

-- Enable RLS on the new table
ALTER TABLE public.holders_intel_dex_triggers ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role has full access to dex_triggers"
  ON public.holders_intel_dex_triggers
  FOR ALL
  USING (true)
  WITH CHECK (true);