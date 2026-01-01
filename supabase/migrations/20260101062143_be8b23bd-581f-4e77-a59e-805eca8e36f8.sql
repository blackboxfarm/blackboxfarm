-- Add enhanced token quality scoring columns to pumpfun_discovery_logs
ALTER TABLE public.pumpfun_discovery_logs
ADD COLUMN IF NOT EXISTS is_mayhem_mode boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS social_score integer,
ADD COLUMN IF NOT EXISTS twitter_score integer,
ADD COLUMN IF NOT EXISTS website_score integer,
ADD COLUMN IF NOT EXISTS telegram_score integer,
ADD COLUMN IF NOT EXISTS social_details jsonb,
ADD COLUMN IF NOT EXISTS dex_paid_early boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS dex_paid_details jsonb,
ADD COLUMN IF NOT EXISTS price_tier text,
ADD COLUMN IF NOT EXISTS wallet_quality_score integer,
ADD COLUMN IF NOT EXISTS first_buyers_analysis jsonb;

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_discovery_logs_mayhem_mode ON public.pumpfun_discovery_logs(is_mayhem_mode) WHERE is_mayhem_mode = true;
CREATE INDEX IF NOT EXISTS idx_discovery_logs_dex_paid ON public.pumpfun_discovery_logs(dex_paid_early) WHERE dex_paid_early = true;
CREATE INDEX IF NOT EXISTS idx_discovery_logs_social_score ON public.pumpfun_discovery_logs(social_score);
CREATE INDEX IF NOT EXISTS idx_discovery_logs_price_tier ON public.pumpfun_discovery_logs(price_tier);

-- Add check constraint for price_tier values
ALTER TABLE public.pumpfun_discovery_logs
ADD CONSTRAINT valid_price_tier CHECK (price_tier IS NULL OR price_tier IN ('ultra_low', 'low', 'medium', 'high'));