-- Create pumpfun_watchlist table for continuous token monitoring
CREATE TABLE public.pumpfun_watchlist (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    token_mint TEXT NOT NULL UNIQUE,
    token_symbol TEXT,
    token_name TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'watching' CHECK (status IN ('watching', 'qualified', 'dead', 'bombed', 'removed')),
    check_count INTEGER NOT NULL DEFAULT 1,
    
    -- Current stats
    holder_count INTEGER DEFAULT 0,
    volume_sol NUMERIC DEFAULT 0,
    price_usd NUMERIC,
    tx_count INTEGER DEFAULT 0,
    market_cap_usd NUMERIC,
    liquidity_usd NUMERIC,
    
    -- Previous stats for delta tracking
    holder_count_prev INTEGER DEFAULT 0,
    volume_sol_prev NUMERIC DEFAULT 0,
    price_usd_prev NUMERIC,
    
    -- Peak tracking
    price_ath_usd NUMERIC,
    holder_count_peak INTEGER DEFAULT 0,
    
    -- Analysis scores
    bundle_score INTEGER,
    social_score INTEGER,
    
    -- Creator info
    creator_wallet TEXT,
    
    -- Lifecycle tracking
    qualification_reason TEXT,
    removal_reason TEXT,
    qualified_at TIMESTAMPTZ,
    removed_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pumpfun_watchlist ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can manage watchlist"
ON public.pumpfun_watchlist
FOR ALL
USING (true)
WITH CHECK (true);

-- Create indexes for common queries
CREATE INDEX idx_pumpfun_watchlist_status ON public.pumpfun_watchlist(status);
CREATE INDEX idx_pumpfun_watchlist_first_seen ON public.pumpfun_watchlist(first_seen_at DESC);
CREATE INDEX idx_pumpfun_watchlist_last_checked ON public.pumpfun_watchlist(last_checked_at DESC);
CREATE INDEX idx_pumpfun_watchlist_holder_count ON public.pumpfun_watchlist(holder_count DESC);
CREATE INDEX idx_pumpfun_watchlist_volume ON public.pumpfun_watchlist(volume_sol DESC);

-- Trigger for updated_at
CREATE TRIGGER update_pumpfun_watchlist_updated_at
BEFORE UPDATE ON public.pumpfun_watchlist
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();