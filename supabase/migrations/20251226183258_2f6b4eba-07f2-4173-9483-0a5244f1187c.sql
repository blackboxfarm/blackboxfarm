-- Add emergency sell columns to flip_positions table
ALTER TABLE public.flip_positions
ADD COLUMN IF NOT EXISTS emergency_sell_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS emergency_sell_price_usd NUMERIC,
ADD COLUMN IF NOT EXISTS emergency_sell_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS emergency_sell_executed_at TIMESTAMPTZ;

-- Add comment to explain the emergency_sell_status values
COMMENT ON COLUMN public.flip_positions.emergency_sell_status IS 'Values: pending, watching, executed, cancelled';