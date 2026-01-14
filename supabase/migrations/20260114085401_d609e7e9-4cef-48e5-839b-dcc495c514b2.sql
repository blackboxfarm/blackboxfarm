-- Create x_communities table for tracking X Community data
CREATE TABLE public.x_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id TEXT UNIQUE NOT NULL,
  community_url TEXT NOT NULL,
  name TEXT,
  description TEXT,
  member_count INTEGER,
  created_at_x TIMESTAMPTZ,
  -- Linked accounts
  admin_usernames TEXT[] DEFAULT '{}',
  moderator_usernames TEXT[] DEFAULT '{}',
  linked_token_mints TEXT[] DEFAULT '{}',
  linked_wallets TEXT[] DEFAULT '{}',
  -- Enrichment status
  last_scraped_at TIMESTAMPTZ,
  scrape_status TEXT DEFAULT 'pending',
  raw_data JSONB,
  -- Risk tracking
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  -- System
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create dev_teams table for tracking organized groups
CREATE TABLE public.dev_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name TEXT,
  team_hash TEXT UNIQUE, -- Hash of sorted member identifiers for deduplication
  -- Members
  member_wallets TEXT[] DEFAULT '{}',
  member_twitter_accounts TEXT[] DEFAULT '{}',
  member_telegram_accounts TEXT[] DEFAULT '{}',
  admin_usernames TEXT[] DEFAULT '{}',
  moderator_usernames TEXT[] DEFAULT '{}',
  -- Linked entities
  linked_token_mints TEXT[] DEFAULT '{}',
  linked_x_communities TEXT[] DEFAULT '{}',
  -- Risk assessment
  tokens_created INTEGER DEFAULT 0,
  tokens_rugged INTEGER DEFAULT 0,
  estimated_stolen_sol NUMERIC DEFAULT 0,
  risk_level TEXT DEFAULT 'unknown',
  -- Metadata
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  evidence JSONB DEFAULT '{}',
  source TEXT DEFAULT 'auto_detected',
  -- System
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create launchpad_creator_profiles table
CREATE TABLE public.launchpad_creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL, -- 'pump.fun', 'bags.fm', 'bonk.fun', 'believe.app'
  -- Platform-specific identifiers
  creator_wallet TEXT,
  platform_username TEXT,
  platform_user_id TEXT,
  linked_x_account TEXT,
  profile_url TEXT,
  -- Activity stats
  tokens_created INTEGER DEFAULT 0,
  tokens_graduated INTEGER DEFAULT 0,
  tokens_rugged INTEGER DEFAULT 0,
  total_volume_sol NUMERIC DEFAULT 0,
  -- Cross-references
  linked_token_mints TEXT[] DEFAULT '{}',
  linked_wallets TEXT[] DEFAULT '{}',
  linked_dev_team_id UUID REFERENCES public.dev_teams(id),
  -- Risk
  is_blacklisted BOOLEAN DEFAULT false,
  is_whitelisted BOOLEAN DEFAULT false,
  risk_level TEXT DEFAULT 'unknown',
  risk_notes TEXT,
  -- System
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, creator_wallet)
);

-- Enable RLS
ALTER TABLE public.x_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launchpad_creator_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for super admins
CREATE POLICY "Super admins can manage x_communities"
  ON public.x_communities FOR ALL
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage dev_teams"
  ON public.dev_teams FOR ALL
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage launchpad_creator_profiles"
  ON public.launchpad_creator_profiles FOR ALL
  USING (public.is_super_admin(auth.uid()));

-- Create indexes for fast lookups
CREATE INDEX idx_x_communities_admin_usernames ON public.x_communities USING GIN(admin_usernames);
CREATE INDEX idx_x_communities_moderator_usernames ON public.x_communities USING GIN(moderator_usernames);
CREATE INDEX idx_x_communities_linked_token_mints ON public.x_communities USING GIN(linked_token_mints);

CREATE INDEX idx_dev_teams_member_wallets ON public.dev_teams USING GIN(member_wallets);
CREATE INDEX idx_dev_teams_member_twitter ON public.dev_teams USING GIN(member_twitter_accounts);
CREATE INDEX idx_dev_teams_admin_usernames ON public.dev_teams USING GIN(admin_usernames);
CREATE INDEX idx_dev_teams_risk_level ON public.dev_teams(risk_level);

CREATE INDEX idx_launchpad_creators_platform ON public.launchpad_creator_profiles(platform);
CREATE INDEX idx_launchpad_creators_wallet ON public.launchpad_creator_profiles(creator_wallet);
CREATE INDEX idx_launchpad_creators_x_account ON public.launchpad_creator_profiles(linked_x_account);
CREATE INDEX idx_launchpad_creators_blacklisted ON public.launchpad_creator_profiles(is_blacklisted);

-- Create updated_at triggers
CREATE TRIGGER update_x_communities_updated_at
  BEFORE UPDATE ON public.x_communities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dev_teams_updated_at
  BEFORE UPDATE ON public.dev_teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_launchpad_creators_updated_at
  BEFORE UPDATE ON public.launchpad_creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();