-- Add rebuy price range columns to flip_positions
ALTER TABLE public.flip_positions 
ADD COLUMN IF NOT EXISTS rebuy_price_high_usd NUMERIC,
ADD COLUMN IF NOT EXISTS rebuy_price_low_usd NUMERIC;

-- Add comment for documentation
COMMENT ON COLUMN public.flip_positions.rebuy_price_high_usd IS 'Upper bound of rebuy price range (defaults to entry + 10%)';
COMMENT ON COLUMN public.flip_positions.rebuy_price_low_usd IS 'Lower bound of rebuy price range (defaults to entry - 10%)';