
CREATE TABLE public.rugcheck_cache (
  token_mint TEXT PRIMARY KEY,
  summary_data JSONB NOT NULL,
  score_normalised NUMERIC,
  rugged BOOLEAN DEFAULT false,
  risk_count INTEGER DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rugcheck_cache_fetched ON public.rugcheck_cache (fetched_at DESC);

ALTER TABLE public.rugcheck_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on rugcheck_cache"
  ON public.rugcheck_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
