-- Add detailed reasoning columns to discovery logs for learning/backtesting
ALTER TABLE public.pumpfun_discovery_logs 
ADD COLUMN IF NOT EXISTS price_usd numeric,
ADD COLUMN IF NOT EXISTS market_cap_usd numeric,
ADD COLUMN IF NOT EXISTS liquidity_usd numeric,
ADD COLUMN IF NOT EXISTS bonding_curve_pct numeric,
ADD COLUMN IF NOT EXISTS top5_holder_pct numeric,
ADD COLUMN IF NOT EXISTS top10_holder_pct numeric,
ADD COLUMN IF NOT EXISTS similar_holdings_count integer,
ADD COLUMN IF NOT EXISTS creator_wallet text,
ADD COLUMN IF NOT EXISTS creator_integrity_score numeric,
ADD COLUMN IF NOT EXISTS buys_count integer,
ADD COLUMN IF NOT EXISTS sells_count integer,
ADD COLUMN IF NOT EXISTS buy_sell_ratio numeric,
ADD COLUMN IF NOT EXISTS acceptance_reasoning jsonb,
ADD COLUMN IF NOT EXISTS config_snapshot jsonb,
ADD COLUMN IF NOT EXISTS passed_filters text[],
ADD COLUMN IF NOT EXISTS failed_filters text[],
ADD COLUMN IF NOT EXISTS score_breakdown jsonb;

-- Add index for faster querying by decision type
CREATE INDEX IF NOT EXISTS idx_discovery_logs_decision ON public.pumpfun_discovery_logs(decision);
CREATE INDEX IF NOT EXISTS idx_discovery_logs_created_at ON public.pumpfun_discovery_logs(created_at DESC);

-- Add comment explaining the table purpose
COMMENT ON TABLE public.pumpfun_discovery_logs IS 'Detailed logs of all token scan decisions for learning, backtesting, and AI training. Captures all metrics and reasoning for both accepted and rejected tokens.';