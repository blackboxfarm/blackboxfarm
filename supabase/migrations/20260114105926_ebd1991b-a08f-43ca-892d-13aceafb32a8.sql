-- Create token_projects table for 1:1 token tracking with all linked identifiers
CREATE TABLE public.token_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Token Identity (1 per project)
  token_mint TEXT NOT NULL UNIQUE,
  token_symbol TEXT,
  token_name TEXT,
  
  -- Creator/Minting Wallet (1 per project)
  creator_wallet TEXT,
  
  -- Upstream Funding Chain (wallets that funded the creator)
  upstream_wallets TEXT[] DEFAULT '{}',
  parent_kyc_wallet TEXT, -- If any upstream wallet is KYC verified
  
  -- Launchpad Info
  launchpad_platform TEXT, -- pump.fun, moonshot, etc
  launchpad_account_id TEXT, -- Their account on the platform
  
  -- Primary X/Twitter Presence
  primary_twitter_url TEXT,
  twitter_type TEXT, -- 'account' or 'community'
  x_community_id TEXT, -- If it's a community
  
  -- Community Leadership (if X Community)
  community_admins TEXT[] DEFAULT '{}', -- Admin usernames
  community_mods TEXT[] DEFAULT '{}', -- Moderator usernames
  
  -- Other Socials
  website_url TEXT,
  telegram_url TEXT,
  discord_url TEXT,
  
  -- Risk Assessment
  risk_level TEXT DEFAULT 'unknown', -- unknown, low, medium, high, critical
  trust_rating TEXT DEFAULT 'neutral', -- good, neutral, concern, danger
  
  -- Metadata
  source TEXT DEFAULT 'manual', -- flipit_backfill, flipit_lock, flipit_sell, manual
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Launch timing
  launch_date TIMESTAMP WITH TIME ZONE,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.token_projects ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access for token_projects"
ON public.token_projects FOR SELECT
USING (true);

-- Authenticated insert/update
CREATE POLICY "Authenticated users can insert token_projects"
ON public.token_projects FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update token_projects"
ON public.token_projects FOR UPDATE
TO authenticated
USING (true);

-- Indexes for cross-referencing
CREATE INDEX idx_token_projects_creator_wallet ON public.token_projects(creator_wallet);
CREATE INDEX idx_token_projects_x_community_id ON public.token_projects(x_community_id);
CREATE INDEX idx_token_projects_upstream_wallets ON public.token_projects USING GIN(upstream_wallets);
CREATE INDEX idx_token_projects_community_admins ON public.token_projects USING GIN(community_admins);
CREATE INDEX idx_token_projects_community_mods ON public.token_projects USING GIN(community_mods);
CREATE INDEX idx_token_projects_risk_level ON public.token_projects(risk_level);
CREATE INDEX idx_token_projects_trust_rating ON public.token_projects(trust_rating);

-- Trigger for updated_at
CREATE TRIGGER update_token_projects_updated_at
BEFORE UPDATE ON public.token_projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();