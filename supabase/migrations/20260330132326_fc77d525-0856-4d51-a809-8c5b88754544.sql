
-- Intelligence Feature Flags (failsafe toggle system)
CREATE TABLE IF NOT EXISTS public.intelligence_feature_flags (
  feature_name TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.intelligence_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read feature flags"
  ON public.intelligence_feature_flags FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can manage feature flags"
  ON public.intelligence_feature_flags FOR ALL
  TO service_role USING (true);

INSERT INTO public.intelligence_feature_flags (feature_name, enabled, description) VALUES
  ('behavioral_scoring', true, 'Dev behavior scoring engine - analyzes mint patterns and dump velocity'),
  ('template_fingerprinting', true, 'Token metadata fingerprinting - detects serial ruggers reusing templates'),
  ('co_mint_clustering', true, 'Co-minting cluster detection - links wallets minting in same block window'),
  ('predictive_burst_mode', true, 'Predictive burst mode - triggers alerts on SOL inflows before mints'),
  ('funding_contamination', true, 'Funding tree contamination - propagates bad actor scores through families')
ON CONFLICT (feature_name) DO NOTHING;

-- Dev Behavior Scores
CREATE TABLE IF NOT EXISTS public.dev_behavior_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  mint_count INTEGER DEFAULT 0,
  avg_lifespan_hours NUMERIC DEFAULT 0,
  supply_retention_pct NUMERIC DEFAULT 0,
  dump_velocity_score NUMERIC DEFAULT 0,
  risk_tier TEXT NOT NULL DEFAULT 'unknown' CHECK (risk_tier IN ('clean', 'caution', 'suspicious', 'bad_actor', 'unknown')),
  evidence JSONB DEFAULT '{}',
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wallet_address)
);

ALTER TABLE public.dev_behavior_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read behavior scores"
  ON public.dev_behavior_scores FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role manages behavior scores"
  ON public.dev_behavior_scores FOR ALL
  TO service_role USING (true);

CREATE INDEX idx_dev_behavior_scores_risk ON public.dev_behavior_scores(risk_tier);
CREATE INDEX idx_dev_behavior_scores_wallet ON public.dev_behavior_scores(wallet_address);

-- Token Fingerprints
CREATE TABLE IF NOT EXISTS public.token_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  name_hash TEXT,
  description_hash TEXT,
  image_hash TEXT,
  cluster_id TEXT,
  match_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(token_mint)
);

ALTER TABLE public.token_fingerprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read token fingerprints"
  ON public.token_fingerprints FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role manages token fingerprints"
  ON public.token_fingerprints FOR ALL
  TO service_role USING (true);

CREATE INDEX idx_token_fingerprints_cluster ON public.token_fingerprints(cluster_id);
CREATE INDEX idx_token_fingerprints_name_hash ON public.token_fingerprints(name_hash);

-- Co-Mint Clusters
CREATE TABLE IF NOT EXISTS public.co_mint_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id TEXT NOT NULL,
  wallet_addresses JSONB NOT NULL DEFAULT '[]',
  mint_addresses JSONB NOT NULL DEFAULT '[]',
  block_window JSONB DEFAULT '{}',
  confidence INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cluster_id)
);

ALTER TABLE public.co_mint_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read co-mint clusters"
  ON public.co_mint_clusters FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role manages co-mint clusters"
  ON public.co_mint_clusters FOR ALL
  TO service_role USING (true);
