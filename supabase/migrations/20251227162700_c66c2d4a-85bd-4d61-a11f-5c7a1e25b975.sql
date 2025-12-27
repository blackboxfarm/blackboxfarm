-- Add rebuy target multiplier column to flip_positions
ALTER TABLE flip_positions 
ADD COLUMN IF NOT EXISTS rebuy_target_multiplier NUMERIC DEFAULT 2;

-- Add comment for documentation
COMMENT ON COLUMN flip_positions.rebuy_target_multiplier IS 'Target multiplier for the new position created when rebuy triggers (default 2x)';