-- Add monitoring mode column: 'tight' (2s price check) or 'deep' (1h volume check)
ALTER TABLE flip_limit_orders 
  ADD COLUMN IF NOT EXISTS monitoring_mode TEXT NOT NULL DEFAULT 'tight';

-- Add volume trigger fields for Deep mode
ALTER TABLE flip_limit_orders 
  ADD COLUMN IF NOT EXISTS volume_trigger_delta NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS volume_direction TEXT DEFAULT NULL;

-- Add constraint for valid monitoring modes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_monitoring_mode'
  ) THEN
    ALTER TABLE flip_limit_orders 
      ADD CONSTRAINT valid_monitoring_mode CHECK (monitoring_mode IN ('tight', 'deep'));
  END IF;
END $$;

-- Add constraint for volume direction
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_volume_direction'
  ) THEN
    ALTER TABLE flip_limit_orders 
      ADD CONSTRAINT valid_volume_direction CHECK (volume_direction IN ('rise', 'dump') OR volume_direction IS NULL);
  END IF;
END $$;