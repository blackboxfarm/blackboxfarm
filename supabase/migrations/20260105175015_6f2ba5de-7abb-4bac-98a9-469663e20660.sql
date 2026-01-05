-- Table to track token lifecycle after our decision (for sleeper/killer dev detection)
CREATE TABLE public.token_lifecycle_tracking (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    token_mint TEXT NOT NULL,
    our_decision TEXT NOT NULL CHECK (our_decision IN ('rejected', 'bought', 'passed', 'watching')),
    our_decision_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    decision_reason TEXT,
    
    -- Outcome tracking
    outcome_type TEXT CHECK (outcome_type IN ('spiked', 'died', 'stable', 'graduated', 'unknown')),
    outcome_detected_at TIMESTAMP WITH TIME ZONE,
    
    -- Price tracking post-decision
    price_at_decision NUMERIC,
    peak_price_after_decision NUMERIC,
    lowest_price_after_decision NUMERIC,
    final_price NUMERIC,
    
    -- Developer behavior
    dev_wallet TEXT,
    dev_action TEXT CHECK (dev_action IN ('sold', 'dumped', 'new_launch', 'held', 'unknown')),
    dev_action_detected_at TIMESTAMP WITH TIME ZONE,
    
    -- Time metrics
    time_to_spike_mins INTEGER,
    time_to_death_mins INTEGER,
    lifespan_mins INTEGER,
    
    -- Was this a missed opportunity?
    was_missed_opportunity BOOLEAN DEFAULT false,
    missed_gain_pct NUMERIC,
    
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for lifecycle tracking
CREATE INDEX idx_token_lifecycle_token_mint ON public.token_lifecycle_tracking(token_mint);
CREATE INDEX idx_token_lifecycle_outcome ON public.token_lifecycle_tracking(outcome_type);
CREATE INDEX idx_token_lifecycle_decision ON public.token_lifecycle_tracking(our_decision);
CREATE INDEX idx_token_lifecycle_dev_wallet ON public.token_lifecycle_tracking(dev_wallet);
CREATE INDEX idx_token_lifecycle_missed ON public.token_lifecycle_tracking(was_missed_opportunity) WHERE was_missed_opportunity = true;

-- Enable RLS
ALTER TABLE public.token_lifecycle_tracking ENABLE ROW LEVEL SECURITY;

-- Public read for admin purposes
CREATE POLICY "Allow public read for token lifecycle"
ON public.token_lifecycle_tracking FOR SELECT
USING (true);

CREATE POLICY "Allow service role full access to token lifecycle"
ON public.token_lifecycle_tracking FOR ALL
USING (true);

-- Table to track developer wallet reputation
CREATE TABLE public.dev_wallet_reputation (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address TEXT NOT NULL UNIQUE,
    
    -- Token history
    total_tokens_launched INTEGER DEFAULT 0,
    tokens_rugged INTEGER DEFAULT 0,
    tokens_successful INTEGER DEFAULT 0,
    tokens_graduated INTEGER DEFAULT 0,
    tokens_abandoned INTEGER DEFAULT 0,
    
    -- Reputation scoring (0-100)
    reputation_score NUMERIC DEFAULT 50,
    trust_level TEXT DEFAULT 'unknown' CHECK (trust_level IN ('blacklisted', 'suspicious', 'unknown', 'neutral', 'trusted', 'verified')),
    
    -- Behavior patterns
    avg_time_before_dump_mins INTEGER,
    avg_peak_mcap_usd NUMERIC,
    typical_sell_percentage NUMERIC,
    launches_new_while_active BOOLEAN DEFAULT false,
    
    -- Social connections
    twitter_accounts TEXT[] DEFAULT '{}',
    telegram_groups TEXT[] DEFAULT '{}',
    discord_servers TEXT[] DEFAULT '{}',
    
    -- Wallet network (funding sources, connected wallets)
    upstream_wallets TEXT[] DEFAULT '{}',
    downstream_wallets TEXT[] DEFAULT '{}',
    known_aliases TEXT[] DEFAULT '{}',
    
    -- Tracking
    first_seen_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    last_analyzed_at TIMESTAMP WITH TIME ZONE,
    
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for dev reputation
CREATE INDEX idx_dev_reputation_wallet ON public.dev_wallet_reputation(wallet_address);
CREATE INDEX idx_dev_reputation_score ON public.dev_wallet_reputation(reputation_score DESC);
CREATE INDEX idx_dev_reputation_trust ON public.dev_wallet_reputation(trust_level);
CREATE INDEX idx_dev_reputation_rugs ON public.dev_wallet_reputation(tokens_rugged DESC);

-- Enable RLS
ALTER TABLE public.dev_wallet_reputation ENABLE ROW LEVEL SECURITY;

-- Public read for admin purposes
CREATE POLICY "Allow public read for dev reputation"
ON public.dev_wallet_reputation FOR SELECT
USING (true);

CREATE POLICY "Allow service role full access to dev reputation"
ON public.dev_wallet_reputation FOR ALL
USING (true);

-- Trigger for updated_at on both tables
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_token_lifecycle_updated_at
    BEFORE UPDATE ON public.token_lifecycle_tracking
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dev_reputation_updated_at
    BEFORE UPDATE ON public.dev_wallet_reputation
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();