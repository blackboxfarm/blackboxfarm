-- Add developer tracking fields to fantasy positions
ALTER TABLE public.telegram_fantasy_positions 
ADD COLUMN IF NOT EXISTS developer_id uuid REFERENCES public.developer_profiles(id),
ADD COLUMN IF NOT EXISTS developer_risk_level text,
ADD COLUMN IF NOT EXISTS developer_reputation_score numeric,
ADD COLUMN IF NOT EXISTS developer_warning text,
ADD COLUMN IF NOT EXISTS developer_twitter_handle text,
ADD COLUMN IF NOT EXISTS developer_total_tokens integer,
ADD COLUMN IF NOT EXISTS developer_rug_count integer,
ADD COLUMN IF NOT EXISTS adjusted_by_dev_risk boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS original_sell_multiplier numeric;

-- Create index for developer lookups
CREATE INDEX IF NOT EXISTS idx_fantasy_positions_developer ON public.telegram_fantasy_positions(developer_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_positions_risk_level ON public.telegram_fantasy_positions(developer_risk_level);

-- Add bundled_wallet_count and wash_trading_detected to developer_profiles for additional risk signals
ALTER TABLE public.developer_profiles
ADD COLUMN IF NOT EXISTS bundled_wallet_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS wash_trading_detected boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS quick_dump_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_hold_time_hours numeric,
ADD COLUMN IF NOT EXISTS blacklist_reason text;

COMMENT ON COLUMN public.telegram_fantasy_positions.developer_id IS 'Link to developer profile who created this token';
COMMENT ON COLUMN public.telegram_fantasy_positions.developer_risk_level IS 'Risk level at time of position creation: verified, low, medium, high, critical';
COMMENT ON COLUMN public.telegram_fantasy_positions.adjusted_by_dev_risk IS 'Whether sell targets were adjusted based on developer risk';
COMMENT ON COLUMN public.developer_profiles.bundled_wallet_count IS 'Number of bundled wallets detected for this developer';
COMMENT ON COLUMN public.developer_profiles.wash_trading_detected IS 'Whether wash trading patterns were detected';
COMMENT ON COLUMN public.developer_profiles.quick_dump_count IS 'Number of times developer dumped tokens quickly after launch';