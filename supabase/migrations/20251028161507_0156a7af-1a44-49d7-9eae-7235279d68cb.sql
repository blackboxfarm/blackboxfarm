-- =====================================================
-- PHASE 1: Developer Intelligence & Watchdog Database
-- Creates 6 tables for tracking developers and real-time monitoring
-- =====================================================

-- Table 1: Developer Profiles - Master developer records
CREATE TABLE IF NOT EXISTS public.developer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_wallet_address TEXT NOT NULL UNIQUE,
  kyc_source TEXT CHECK (kyc_source IN ('coinbase', 'binance', 'kraken', 'bybit', 'okx', 'unknown')),
  kyc_verified BOOLEAN DEFAULT false,
  kyc_verification_date TIMESTAMP WITH TIME ZONE,
  display_name TEXT,
  twitter_handle TEXT,
  telegram_handle TEXT,
  discord_handle TEXT,
  website_url TEXT,
  reputation_score NUMERIC(5,2) DEFAULT 50.00 CHECK (reputation_score >= 0 AND reputation_score <= 100),
  trust_level TEXT DEFAULT 'neutral' CHECK (trust_level IN ('trusted', 'neutral', 'suspicious', 'scammer')),
  total_tokens_created INTEGER DEFAULT 0,
  successful_tokens INTEGER DEFAULT 0,
  failed_tokens INTEGER DEFAULT 0,
  total_volume_generated NUMERIC(20,2) DEFAULT 0,
  average_token_lifespan_days NUMERIC(10,2) DEFAULT 0,
  rug_pull_count INTEGER DEFAULT 0,
  slow_drain_count INTEGER DEFAULT 0,
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_analysis_at TIMESTAMP WITH TIME ZONE
);

-- Table 2: Developer Wallets - Wallet lineage tracking
CREATE TABLE IF NOT EXISTS public.developer_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES public.developer_profiles(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('master', 'funding_source', 'token_creator', 'intermediate', 'cex_withdrawal')),
  parent_wallet_address TEXT,
  depth_level INTEGER DEFAULT 0,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_sol_received NUMERIC(20,9) DEFAULT 0,
  total_sol_sent NUMERIC(20,9) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(developer_id, wallet_address)
);

-- Table 3: Developer Tokens - Token portfolio history
CREATE TABLE IF NOT EXISTS public.developer_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES public.developer_profiles(id) ON DELETE CASCADE,
  token_mint TEXT NOT NULL,
  creator_wallet TEXT NOT NULL,
  funding_wallet TEXT,
  launch_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  death_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  peak_market_cap_usd NUMERIC(20,2),
  current_market_cap_usd NUMERIC(20,2),
  total_volume_usd NUMERIC(20,2) DEFAULT 0,
  holder_count INTEGER DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  liquidity_locked BOOLEAN DEFAULT false,
  liquidity_lock_duration_days INTEGER,
  mint_authority_revoked BOOLEAN DEFAULT false,
  freeze_authority_revoked BOOLEAN DEFAULT false,
  launchpad TEXT,
  performance_score NUMERIC(5,2) DEFAULT 0 CHECK (performance_score >= 0 AND performance_score <= 100),
  lifespan_days INTEGER DEFAULT 0,
  outcome TEXT CHECK (outcome IN ('success', 'failed', 'rug_pull', 'slow_drain', 'active', 'unknown')),
  rug_pull_evidence JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(developer_id, token_mint)
);

-- Table 4: Wallet Funding Traces - Historical funding chains
CREATE TABLE IF NOT EXISTS public.wallet_funding_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES public.developer_profiles(id) ON DELETE CASCADE,
  from_wallet TEXT NOT NULL,
  to_wallet TEXT NOT NULL,
  amount_sol NUMERIC(20,9) NOT NULL,
  transaction_signature TEXT UNIQUE,
  trace_depth INTEGER DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  source_type TEXT CHECK (source_type IN ('cex_withdrawal', 'internal_transfer', 'external_transfer', 'unknown')),
  cex_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 5: Developer Analysis Jobs - Progressive scraping queue
CREATE TABLE IF NOT EXISTS public.developer_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES public.developer_profiles(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('wallet_trace', 'token_discovery', 'performance_update', 'watchdog_scan', 'reputation_calc')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  wallet_address TEXT,
  max_depth INTEGER DEFAULT 10,
  current_depth INTEGER DEFAULT 0,
  wallets_discovered INTEGER DEFAULT 0,
  tokens_discovered INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  results JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 6: Token Mint Watchdog - Real-time monitoring
CREATE TABLE IF NOT EXISTS public.token_mint_watchdog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  creator_wallet TEXT NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  block_slot BIGINT,
  developer_id UUID REFERENCES public.developer_profiles(id) ON DELETE SET NULL,
  match_confidence TEXT CHECK (match_confidence IN ('high', 'medium', 'low', 'unknown')) DEFAULT 'unknown',
  alert_level TEXT NOT NULL CHECK (alert_level IN ('safe', 'caution', 'danger', 'critical')) DEFAULT 'caution',
  alert_sent BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMP WITH TIME ZONE,
  quick_analysis JSONB DEFAULT '{}',
  recommendation TEXT CHECK (recommendation IN ('buy', 'hold', 'avoid', 'danger')) DEFAULT 'hold',
  reasoning TEXT,
  deep_analysis_completed BOOLEAN DEFAULT false,
  deep_analysis_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(token_mint)
);

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- Developer Profiles indexes
CREATE INDEX IF NOT EXISTS idx_developer_profiles_master_wallet ON public.developer_profiles(master_wallet_address);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_trust_level ON public.developer_profiles(trust_level);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_reputation ON public.developer_profiles(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_twitter ON public.developer_profiles(twitter_handle) WHERE twitter_handle IS NOT NULL;

-- Developer Wallets indexes
CREATE INDEX IF NOT EXISTS idx_developer_wallets_developer ON public.developer_wallets(developer_id);
CREATE INDEX IF NOT EXISTS idx_developer_wallets_address ON public.developer_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_developer_wallets_parent ON public.developer_wallets(parent_wallet_address) WHERE parent_wallet_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_developer_wallets_type ON public.developer_wallets(wallet_type);

-- Developer Tokens indexes
CREATE INDEX IF NOT EXISTS idx_developer_tokens_developer ON public.developer_tokens(developer_id);
CREATE INDEX IF NOT EXISTS idx_developer_tokens_mint ON public.developer_tokens(token_mint);
CREATE INDEX IF NOT EXISTS idx_developer_tokens_creator ON public.developer_tokens(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_developer_tokens_outcome ON public.developer_tokens(outcome);
CREATE INDEX IF NOT EXISTS idx_developer_tokens_active ON public.developer_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_developer_tokens_launch_date ON public.developer_tokens(launch_date DESC);

-- Wallet Funding Traces indexes
CREATE INDEX IF NOT EXISTS idx_funding_traces_developer ON public.wallet_funding_traces(developer_id);
CREATE INDEX IF NOT EXISTS idx_funding_traces_from ON public.wallet_funding_traces(from_wallet);
CREATE INDEX IF NOT EXISTS idx_funding_traces_to ON public.wallet_funding_traces(to_wallet);
CREATE INDEX IF NOT EXISTS idx_funding_traces_timestamp ON public.wallet_funding_traces(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_funding_traces_source_type ON public.wallet_funding_traces(source_type);

-- Developer Analysis Jobs indexes
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_developer ON public.developer_analysis_jobs(developer_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON public.developer_analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_type ON public.developer_analysis_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_created ON public.developer_analysis_jobs(created_at DESC);

-- Token Mint Watchdog indexes
CREATE INDEX IF NOT EXISTS idx_watchdog_token_mint ON public.token_mint_watchdog(token_mint);
CREATE INDEX IF NOT EXISTS idx_watchdog_creator ON public.token_mint_watchdog(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_watchdog_developer ON public.token_mint_watchdog(developer_id);
CREATE INDEX IF NOT EXISTS idx_watchdog_alert_level ON public.token_mint_watchdog(alert_level);
CREATE INDEX IF NOT EXISTS idx_watchdog_detected_at ON public.token_mint_watchdog(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchdog_alert_sent ON public.token_mint_watchdog(alert_sent, alert_level);
CREATE INDEX IF NOT EXISTS idx_watchdog_recommendation ON public.token_mint_watchdog(recommendation);

-- =====================================================
-- Triggers for updated_at timestamps
-- =====================================================

CREATE TRIGGER update_developer_profiles_updated_at
  BEFORE UPDATE ON public.developer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_developer_tokens_updated_at
  BEFORE UPDATE ON public.developer_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

ALTER TABLE public.developer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_funding_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_mint_watchdog ENABLE ROW LEVEL SECURITY;

-- Super admins only policies
CREATE POLICY "Super admins can manage developer profiles"
  ON public.developer_profiles
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage developer wallets"
  ON public.developer_wallets
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage developer tokens"
  ON public.developer_tokens
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage funding traces"
  ON public.wallet_funding_traces
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage analysis jobs"
  ON public.developer_analysis_jobs
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage watchdog records"
  ON public.token_mint_watchdog
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Service role can insert watchdog records (for edge functions)
CREATE POLICY "Service role can insert watchdog records"
  ON public.token_mint_watchdog
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update watchdog records"
  ON public.token_mint_watchdog
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);