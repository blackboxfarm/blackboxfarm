-- Token Retrace Analysis Table
-- Stores comprehensive retroactive analysis of successful tokens
CREATE TABLE public.pumpfun_token_retraces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT UNIQUE NOT NULL,
  
  -- Token identity
  token_name TEXT,
  token_symbol TEXT,
  token_image TEXT,
  
  -- Lifecycle
  launched_at TIMESTAMPTZ,
  graduated_at TIMESTAMPTZ,
  peak_market_cap_usd NUMERIC,
  current_market_cap_usd NUMERIC,
  is_graduated BOOLEAN DEFAULT false,
  
  -- Mint wallet genealogy
  mint_wallet TEXT NOT NULL,
  parent_wallet TEXT,
  grandparent_wallet TEXT,
  funding_source_type TEXT, -- 'cex_withdrawal', 'other_token', 'mixer', 'unknown'
  funding_cex_name TEXT,
  wallet_genealogy_depth INTEGER DEFAULT 0,
  wallet_genealogy_json JSONB DEFAULT '{}',
  
  -- Socials - Pump.fun original (at mint)
  pumpfun_twitter TEXT,
  pumpfun_telegram TEXT,
  pumpfun_website TEXT,
  pumpfun_description TEXT,
  
  -- Socials - DexScreener (current, may be CTO)
  dexscreener_twitter TEXT,
  dexscreener_telegram TEXT,
  dexscreener_website TEXT,
  
  -- Social verification flags
  is_cto_detected BOOLEAN DEFAULT false,
  socials_changed BOOLEAN DEFAULT false,
  original_team_socials JSONB DEFAULT '{}',
  
  -- Twitter/X account analysis (from original team)
  twitter_account_id TEXT,
  twitter_followers INTEGER,
  twitter_created_at TIMESTAMPTZ,
  twitter_verified BOOLEAN DEFAULT false,
  twitter_bio TEXT,
  
  -- Community data
  total_replies INTEGER DEFAULT 0,
  livestream_detected BOOLEAN DEFAULT false,
  community_sentiment TEXT, -- 'bullish', 'bearish', 'mixed', 'unknown'
  
  -- KOL involvement
  kols_involved TEXT[] DEFAULT '{}',
  kol_buy_count INTEGER DEFAULT 0,
  kol_sell_count INTEGER DEFAULT 0,
  kol_timeline JSONB DEFAULT '[]',
  
  -- Developer/creator analysis
  developer_id UUID,
  developer_trust_level TEXT,
  developer_total_tokens INTEGER,
  developer_success_rate NUMERIC,
  
  -- Analysis metadata
  analysis_status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
  analysis_started_at TIMESTAMPTZ,
  analysis_completed_at TIMESTAMPTZ,
  analysis_notes TEXT,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for lookups
CREATE INDEX idx_pumpfun_token_retraces_mint ON pumpfun_token_retraces(token_mint);
CREATE INDEX idx_pumpfun_token_retraces_mint_wallet ON pumpfun_token_retraces(mint_wallet);
CREATE INDEX idx_pumpfun_token_retraces_status ON pumpfun_token_retraces(analysis_status);
CREATE INDEX idx_pumpfun_token_retraces_graduated ON pumpfun_token_retraces(is_graduated);

-- RLS
ALTER TABLE pumpfun_token_retraces ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read token retraces"
  ON pumpfun_token_retraces
  FOR SELECT
  TO authenticated
  USING (true);

-- Full access for super admins
CREATE POLICY "Super admins can manage token retraces"
  ON pumpfun_token_retraces
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Update trigger
CREATE TRIGGER update_pumpfun_token_retraces_updated_at
  BEFORE UPDATE ON pumpfun_token_retraces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();