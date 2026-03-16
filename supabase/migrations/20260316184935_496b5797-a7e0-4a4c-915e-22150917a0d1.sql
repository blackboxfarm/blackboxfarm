
-- Table for AI-extracted recurring death/survival patterns
CREATE TABLE public.token_pattern_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id TEXT NOT NULL UNIQUE, -- e.g. 'rug_whale_concentration_no_socials'
  pattern_type TEXT NOT NULL, -- 'death_signal', 'survival_signal', 'neutral'
  outcome_association TEXT NOT NULL, -- 'rug', 'pump_dump', 'slow_bleed', 'survive', 'thrive'
  description TEXT NOT NULL, -- Human readable
  conditions JSONB NOT NULL DEFAULT '{}', -- Structured conditions: {"whale_supply_pct": ">40", "has_twitter": false}
  confidence_pct NUMERIC NOT NULL DEFAULT 50, -- How often this pattern leads to the outcome
  sample_size INTEGER NOT NULL DEFAULT 0, -- How many assessments matched
  example_tokens JSONB DEFAULT '[]', -- Array of {symbol, outcome, similarity}
  is_active BOOLEAN NOT NULL DEFAULT true,
  extracted_by TEXT DEFAULT 'ai', -- 'ai' or 'manual'
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.token_pattern_rules ENABLE ROW LEVEL SECURITY;

-- Public read for edge functions (service role writes)
CREATE POLICY "Service role full access on token_pattern_rules"
  ON public.token_pattern_rules FOR ALL
  USING (true) WITH CHECK (true);

-- Add columns to token_assessments for AI prediction tracking
ALTER TABLE public.token_assessments 
  ADD COLUMN IF NOT EXISTS ai_prediction TEXT,
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS ai_similar_tokens JSONB,
  ADD COLUMN IF NOT EXISTS prediction_validated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS matched_pattern_rules JSONB DEFAULT '[]';

-- Index for fast pattern lookups
CREATE INDEX IF NOT EXISTS idx_pattern_rules_active ON public.token_pattern_rules (is_active, outcome_association);
CREATE INDEX IF NOT EXISTS idx_assessments_ai_prediction ON public.token_assessments (ai_prediction) WHERE ai_prediction IS NOT NULL;
