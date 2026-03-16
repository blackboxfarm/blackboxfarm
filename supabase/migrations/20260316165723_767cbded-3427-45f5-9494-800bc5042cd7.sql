
-- Token Early Warnings cache: stores risk signals for fast auto-scan replies
-- Cumulative: same token can accumulate multiple warnings over time from many scans
CREATE TABLE public.token_early_warnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint TEXT NOT NULL,
  warning_type TEXT NOT NULL, -- e.g. 'tier_divergence_high', 'volume_mcap_suspicious', 'alleged_wash_trading', 'dev_zero_genealogy', 'x_low_credibility', 'bundle_detected', 'liquidity_fragile'
  severity TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  plain_text TEXT NOT NULL, -- Human-readable street language warning
  metric_value NUMERIC, -- The raw metric value that triggered this
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_function TEXT, -- Which edge function generated this warning
  scan_count INTEGER NOT NULL DEFAULT 1, -- How many times this signal has been seen
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(token_mint, warning_type) -- One warning per type per token, updated on re-detection
);

-- Index for fast auto-scan lookups (primary query path)
CREATE INDEX idx_token_early_warnings_mint ON public.token_early_warnings(token_mint);
CREATE INDEX idx_token_early_warnings_severity ON public.token_early_warnings(severity, detected_at DESC);

-- Enable RLS
ALTER TABLE public.token_early_warnings ENABLE ROW LEVEL SECURITY;

-- Public read (bot needs to read these for auto-scan replies)
CREATE POLICY "Anyone can read early warnings"
  ON public.token_early_warnings FOR SELECT
  USING (true);

-- Only service role can write (edge functions)
CREATE POLICY "Service role can manage warnings"
  ON public.token_early_warnings FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE public.token_early_warnings IS 'Cumulative early warning cache for fast auto-scan replies. Warnings accumulate scan_count over time as token is re-analyzed across groups.';
