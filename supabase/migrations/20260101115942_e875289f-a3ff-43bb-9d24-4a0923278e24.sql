-- Add moon bag tracking columns to flip_positions
ALTER TABLE flip_positions 
ADD COLUMN IF NOT EXISTS moon_bag_peak_price_usd numeric,
ADD COLUMN IF NOT EXISTS moon_bag_peak_change_pct numeric,
ADD COLUMN IF NOT EXISTS moon_bag_dump_threshold_pct numeric DEFAULT 50;

-- Add comment for clarity
COMMENT ON COLUMN flip_positions.moon_bag_peak_price_usd IS 'Highest price reached since TP1 was hit - used for trailing stop';
COMMENT ON COLUMN flip_positions.moon_bag_peak_change_pct IS 'Peak percentage gain from entry price';
COMMENT ON COLUMN flip_positions.moon_bag_dump_threshold_pct IS 'Percentage drop from peak that triggers moon bag sell';