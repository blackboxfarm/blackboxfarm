-- Phase 1: Token Rankings & Lifecycle Tracking
CREATE TABLE IF NOT EXISTS token_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  rank INTEGER NOT NULL,
  trending_score NUMERIC,
  market_cap NUMERIC,
  volume_24h NUMERIC,
  price_usd NUMERIC,
  price_change_24h NUMERIC,
  holder_count INTEGER,
  liquidity_usd NUMERIC,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_source TEXT DEFAULT 'dexscreener',
  is_in_top_200 BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_token_rankings_mint_time ON token_rankings(token_mint, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_rankings_rank ON token_rankings(rank, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_rankings_top_200 ON token_rankings(is_in_top_200, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_rankings_captured ON token_rankings(captured_at DESC);

-- Token lifecycle tracking
CREATE TABLE IF NOT EXISTS token_lifecycle (
  token_mint TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  highest_rank INTEGER,
  lowest_rank INTEGER,
  total_hours_in_top_200 INTEGER DEFAULT 0,
  times_entered_top_200 INTEGER DEFAULT 1,
  current_status TEXT DEFAULT 'active',
  creator_wallet TEXT,
  developer_id UUID REFERENCES developer_profiles(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_lifecycle_creator ON token_lifecycle(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_developer ON token_lifecycle(developer_id);
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_status ON token_lifecycle(current_status);
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_highest_rank ON token_lifecycle(highest_rank);

-- Phase 3: Developer Integrity Enhancements
ALTER TABLE developer_profiles 
  ADD COLUMN IF NOT EXISTS avg_token_rank_achieved NUMERIC,
  ADD COLUMN IF NOT EXISTS tokens_in_top_10_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_in_top_50_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_in_top_200_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_time_in_rankings_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS integrity_score NUMERIC DEFAULT 50;

-- RLS Policies for token_rankings
ALTER TABLE token_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view token rankings"
  ON token_rankings FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Service role can insert rankings"
  ON token_rankings FOR INSERT
  TO service_role
  WITH CHECK (true);

-- RLS Policies for token_lifecycle
ALTER TABLE token_lifecycle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view token lifecycle"
  ON token_lifecycle FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Service role can manage lifecycle"
  ON token_lifecycle FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to update token lifecycle stats
CREATE OR REPLACE FUNCTION update_token_lifecycle_stats()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER token_lifecycle_updated_at
  BEFORE UPDATE ON token_lifecycle
  FOR EACH ROW
  EXECUTE FUNCTION update_token_lifecycle_stats();