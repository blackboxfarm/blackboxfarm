-- Add dex_paid_status column to flip_positions table
ALTER TABLE public.flip_positions 
ADD COLUMN IF NOT EXISTS dex_paid_status JSONB DEFAULT NULL;

-- Add index for faster querying of positions with DEX status
CREATE INDEX IF NOT EXISTS idx_flip_positions_dex_paid_status 
ON public.flip_positions USING GIN (dex_paid_status) 
WHERE dex_paid_status IS NOT NULL;

-- Comment on the column for documentation
COMMENT ON COLUMN public.flip_positions.dex_paid_status IS 'DexScreener paid status: { activeBoosts, hasPaidProfile, hasActiveAds, hasCTO, orders[], checkedAt }';