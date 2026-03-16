
-- Unified training data table for AI pattern learning
-- Stores both post-mortems (dead tokens) and mid-growth snapshots (survivors)
CREATE TABLE public.token_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  
  -- Assessment type & outcome
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('post_mortem', 'mid_growth', 'live')),
  outcome TEXT CHECK (outcome IN ('rug', 'slow_bleed', 'pump_dump', 'abandoned', 'organic_decline', 'survived', 'thrived', 'pending')),
  cause_of_death TEXT, -- detailed cause for post-mortems
  
  -- Snapshot timing
  token_age_minutes INTEGER, -- age of token at time of assessment
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Price & Market
  price_usd NUMERIC,
  mcap_usd NUMERIC,
  ath_usd NUMERIC,
  price_drop_from_ath_pct NUMERIC, -- how far from ATH at snapshot
  volume_1h NUMERIC,
  volume_24h NUMERIC,
  volume_mcap_ratio NUMERIC,
  liquidity_usd NUMERIC,
  lp_pct_of_supply NUMERIC,
  
  -- Holder Distribution (the key training features)
  total_holders INTEGER,
  real_holders INTEGER,
  dust_wallets INTEGER,
  dust_pct NUMERIC,
  whale_count INTEGER,
  whale_pct NUMERIC,
  whale_supply_pct NUMERIC,
  serious_count INTEGER,
  serious_pct NUMERIC,
  serious_supply_pct NUMERIC,
  retail_count INTEGER,
  retail_pct NUMERIC,
  retail_supply_pct NUMERIC,
  top5_pct NUMERIC,
  top10_pct NUMERIC,
  top20_pct NUMERIC,
  tier_divergence NUMERIC, -- whale% - retail% gap
  
  -- Activity Signals
  buys_1h INTEGER,
  sells_1h INTEGER,
  buy_sell_ratio NUMERIC,
  buys_5m INTEGER,
  sells_5m INTEGER,
  
  -- Health & Risk
  health_score INTEGER,
  health_grade TEXT,
  phase TEXT,
  stability_score INTEGER,
  
  -- Developer Intel
  dev_wallet TEXT,
  dev_holding_pct NUMERIC,
  dev_sold_all BOOLEAN DEFAULT false,
  dev_reputation_score INTEGER,
  dev_trust_level TEXT,
  dev_total_launches INTEGER,
  dev_tokens_rugged INTEGER,
  dev_is_serial_spammer BOOLEAN DEFAULT false,
  dev_pattern TEXT,
  
  -- Social Signals
  has_twitter BOOLEAN DEFAULT false,
  has_telegram BOOLEAN DEFAULT false,
  has_website BOOLEAN DEFAULT false,
  dex_paid BOOLEAN DEFAULT false,
  active_boosts INTEGER DEFAULT 0,
  
  -- Bundle / Insider
  bundled_pct NUMERIC DEFAULT 0,
  insider_cluster_count INTEGER DEFAULT 0,
  fresh_wallet_pct NUMERIC DEFAULT 0,
  
  -- Early Warnings active at time of snapshot
  active_warnings JSONB DEFAULT '[]',
  
  -- Risk flags
  risk_flags JSONB DEFAULT '[]',
  
  -- Full raw data for deep learning later
  raw_report_data JSONB,
  
  -- AI assessment (filled by pattern matcher)
  ai_prediction TEXT, -- what did the AI predict at this snapshot
  ai_confidence NUMERIC, -- 0-100
  ai_reasoning TEXT,
  ai_similar_tokens JSONB, -- references to similar historical tokens
  prediction_validated BOOLEAN, -- was the AI prediction correct?
  validated_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX idx_token_assessments_mint ON public.token_assessments(token_mint);
CREATE INDEX idx_token_assessments_type ON public.token_assessments(assessment_type);
CREATE INDEX idx_token_assessments_outcome ON public.token_assessments(outcome);
CREATE INDEX idx_token_assessments_mcap ON public.token_assessments(mcap_usd);
CREATE INDEX idx_token_assessments_snapshot ON public.token_assessments(snapshot_at);
CREATE INDEX idx_token_assessments_phase ON public.token_assessments(phase);
CREATE UNIQUE INDEX idx_token_assessments_unique ON public.token_assessments(token_mint, assessment_type, snapshot_at);

-- Enable RLS
ALTER TABLE public.token_assessments ENABLE ROW LEVEL SECURITY;

-- Service role only (background scanners write, admin reads)
CREATE POLICY "Service role full access" ON public.token_assessments
  FOR ALL USING (true) WITH CHECK (true);

-- Token vigil tracking — which tokens are being watched for death
CREATE TABLE public.token_vigil (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL UNIQUE,
  symbol TEXT,
  name TEXT,
  
  -- Peak metrics (tracked over time)
  peak_mcap_usd NUMERIC DEFAULT 0,
  peak_holders INTEGER DEFAULT 0,
  peak_price_usd NUMERIC DEFAULT 0,
  peak_volume_1h NUMERIC DEFAULT 0,
  
  -- Current metrics (updated each scan)
  current_mcap_usd NUMERIC DEFAULT 0,
  current_holders INTEGER DEFAULT 0,
  current_price_usd NUMERIC DEFAULT 0,
  current_volume_1h NUMERIC DEFAULT 0,
  current_dust_pct NUMERIC DEFAULT 0,
  
  -- Drop calculations
  price_drop_from_peak_pct NUMERIC DEFAULT 0,
  holder_drop_from_peak_pct NUMERIC DEFAULT 0,
  volume_drop_from_peak_pct NUMERIC DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'watching' CHECK (status IN ('watching', 'declining', 'dead', 'assessed', 'thriving')),
  death_detected_at TIMESTAMPTZ,
  post_mortem_id UUID REFERENCES public.token_assessments(id),
  mid_growth_id UUID REFERENCES public.token_assessments(id),
  
  -- Tracking
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_scanned_at TIMESTAMPTZ,
  scan_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_token_vigil_status ON public.token_vigil(status);
CREATE INDEX idx_token_vigil_mcap ON public.token_vigil(peak_mcap_usd);

ALTER TABLE public.token_vigil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access vigil" ON public.token_vigil
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_token_assessments_updated_at
  BEFORE UPDATE ON public.token_assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_token_vigil_updated_at
  BEFORE UPDATE ON public.token_vigil
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
