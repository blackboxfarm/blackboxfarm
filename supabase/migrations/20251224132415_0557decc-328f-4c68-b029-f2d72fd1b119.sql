-- Add rebuy columns to flip_positions table
ALTER TABLE public.flip_positions 
ADD COLUMN IF NOT EXISTS rebuy_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rebuy_price_usd numeric,
ADD COLUMN IF NOT EXISTS rebuy_amount_usd numeric,
ADD COLUMN IF NOT EXISTS rebuy_status text,
ADD COLUMN IF NOT EXISTS rebuy_executed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rebuy_position_id uuid REFERENCES public.flip_positions(id);

-- Add an index for efficient rebuy monitoring queries
CREATE INDEX IF NOT EXISTS idx_flip_positions_rebuy_status 
ON public.flip_positions(rebuy_status) 
WHERE rebuy_status = 'watching';

-- Comment on columns
COMMENT ON COLUMN public.flip_positions.rebuy_enabled IS 'Whether to watch for rebuy opportunity after sell';
COMMENT ON COLUMN public.flip_positions.rebuy_price_usd IS 'Target dip price to trigger rebuy';
COMMENT ON COLUMN public.flip_positions.rebuy_amount_usd IS 'Amount in USD to spend on rebuy';
COMMENT ON COLUMN public.flip_positions.rebuy_status IS 'Status: pending, watching, executed, cancelled';
COMMENT ON COLUMN public.flip_positions.rebuy_executed_at IS 'When rebuy was triggered';
COMMENT ON COLUMN public.flip_positions.rebuy_position_id IS 'Reference to the new position created from rebuy';