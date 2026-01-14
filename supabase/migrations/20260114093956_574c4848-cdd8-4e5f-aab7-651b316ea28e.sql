-- Add tracking_locked column to flip_positions
-- When TRUE, the system will capture all token data to the tracking system
ALTER TABLE public.flip_positions 
ADD COLUMN IF NOT EXISTS tracking_locked boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.flip_positions.tracking_locked IS 'When locked, triggers data inventory/capture to dev teams and lists';