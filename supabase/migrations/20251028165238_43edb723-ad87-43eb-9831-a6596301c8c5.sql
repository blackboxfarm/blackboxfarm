-- Add performance indexes for the developer intelligence system

-- Developer profiles indexes
CREATE INDEX IF NOT EXISTS idx_developer_profiles_master_wallet ON developer_profiles(master_wallet_address);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_trust_level ON developer_profiles(trust_level);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_reputation ON developer_profiles(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_twitter ON developer_profiles(twitter_handle);

-- Developer wallets indexes
CREATE INDEX IF NOT EXISTS idx_developer_wallets_developer_id ON developer_wallets(developer_id);
CREATE INDEX IF NOT EXISTS idx_developer_wallets_address ON developer_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_developer_wallets_type ON developer_wallets(wallet_type);
CREATE INDEX IF NOT EXISTS idx_developer_wallets_parent ON developer_wallets(parent_wallet_address);
CREATE INDEX IF NOT EXISTS idx_developer_wallets_depth ON developer_wallets(depth_level);

-- Developer tokens indexes
CREATE INDEX IF NOT EXISTS idx_developer_tokens_developer_id ON developer_tokens(developer_id);
CREATE INDEX IF NOT EXISTS idx_developer_tokens_mint ON developer_tokens(token_mint);
CREATE INDEX IF NOT EXISTS idx_developer_tokens_creator ON developer_tokens(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_developer_tokens_outcome ON developer_tokens(outcome);
CREATE INDEX IF NOT EXISTS idx_developer_tokens_launch_date ON developer_tokens(launch_date DESC);
CREATE INDEX IF NOT EXISTS idx_developer_tokens_active ON developer_tokens(is_active);

-- Wallet funding traces indexes (using actual columns from table)
CREATE INDEX IF NOT EXISTS idx_wallet_funding_from ON wallet_funding_traces(from_wallet);
CREATE INDEX IF NOT EXISTS idx_wallet_funding_to ON wallet_funding_traces(to_wallet);
CREATE INDEX IF NOT EXISTS idx_wallet_funding_trace_depth ON wallet_funding_traces(trace_depth);

-- Developer analysis jobs indexes
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_developer ON developer_analysis_jobs(developer_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON developer_analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_created ON developer_analysis_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_wallet ON developer_analysis_jobs(wallet_address);

-- Token mint watchdog indexes
CREATE INDEX IF NOT EXISTS idx_token_watchdog_mint ON token_mint_watchdog(token_mint);
CREATE INDEX IF NOT EXISTS idx_token_watchdog_creator ON token_mint_watchdog(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_token_watchdog_analysis ON token_mint_watchdog(deep_analysis_completed);
CREATE INDEX IF NOT EXISTS idx_token_watchdog_created ON token_mint_watchdog(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_developer_tokens_dev_outcome ON developer_tokens(developer_id, outcome);
CREATE INDEX IF NOT EXISTS idx_developer_wallets_dev_type ON developer_wallets(developer_id, wallet_type);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status_created ON developer_analysis_jobs(status, created_at DESC);