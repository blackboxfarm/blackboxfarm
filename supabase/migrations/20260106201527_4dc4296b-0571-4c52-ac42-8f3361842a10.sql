-- Phase B: Durable rejection memory tables
-- Table to track all seen symbols (for duplicate detection)
CREATE TABLE public.pumpfun_seen_symbols (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    symbol_lower TEXT NOT NULL UNIQUE,
    symbol_original TEXT NOT NULL,
    first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    seen_count INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'allowed' CHECK (status IN ('allowed', 'blocked')),
    block_reason TEXT,
    first_token_mint TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast symbol lookups
CREATE INDEX idx_pumpfun_seen_symbols_lower ON public.pumpfun_seen_symbols(symbol_lower);
CREATE INDEX idx_pumpfun_seen_symbols_status ON public.pumpfun_seen_symbols(status);

-- Table to log all rejection events for audit trail
CREATE TABLE public.pumpfun_rejection_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    token_mint TEXT NOT NULL,
    symbol_original TEXT,
    symbol_lower TEXT,
    token_name TEXT,
    reason TEXT NOT NULL,
    detail TEXT,
    source TEXT DEFAULT 'intake',
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    batch_id TEXT,
    creator_wallet TEXT
);

-- Indexes for rejection events
CREATE INDEX idx_pumpfun_rejection_events_mint ON public.pumpfun_rejection_events(token_mint);
CREATE INDEX idx_pumpfun_rejection_events_symbol ON public.pumpfun_rejection_events(symbol_lower);
CREATE INDEX idx_pumpfun_rejection_events_detected ON public.pumpfun_rejection_events(detected_at DESC);
CREATE INDEX idx_pumpfun_rejection_events_reason ON public.pumpfun_rejection_events(reason);

-- Phase C: Metric snapshots for change-over-time tracking
CREATE TABLE public.pumpfun_metric_snapshots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    token_mint TEXT NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    holder_count INTEGER,
    volume_sol NUMERIC(20, 8),
    price_usd NUMERIC(30, 15),
    market_cap_usd NUMERIC(20, 2),
    liquidity_usd NUMERIC(20, 2),
    bonding_curve_pct NUMERIC(5, 2),
    buys INTEGER,
    sells INTEGER,
    tx_count INTEGER
);

-- Indexes for efficient time-series queries
CREATE INDEX idx_pumpfun_metric_snapshots_mint_time ON public.pumpfun_metric_snapshots(token_mint, captured_at DESC);
CREATE INDEX idx_pumpfun_metric_snapshots_recent ON public.pumpfun_metric_snapshots(captured_at DESC);

-- Add delta columns to pumpfun_watchlist for displaying change-over-time
ALTER TABLE public.pumpfun_watchlist
ADD COLUMN IF NOT EXISTS holders_delta_3m INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS holders_delta_15m INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS volume_delta_3m NUMERIC(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS volume_delta_15m NUMERIC(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_change_pct_3m NUMERIC(10, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_change_pct_15m NUMERIC(10, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS buy_pressure_3m INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS dump_from_ath_pct NUMERIC(10, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS trend_status TEXT DEFAULT 'stable',
ADD COLUMN IF NOT EXISTS last_snapshot_at TIMESTAMP WITH TIME ZONE;

-- Enable RLS on new tables
ALTER TABLE public.pumpfun_seen_symbols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pumpfun_rejection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pumpfun_metric_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies for service role access
CREATE POLICY "Service role can manage seen_symbols"
ON public.pumpfun_seen_symbols
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can manage rejection_events"
ON public.pumpfun_rejection_events
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can manage metric_snapshots"
ON public.pumpfun_metric_snapshots
FOR ALL
USING (true)
WITH CHECK (true);