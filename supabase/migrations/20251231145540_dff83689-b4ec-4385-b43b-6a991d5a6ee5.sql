-- Add missing columns to telegram_channel_calls for Scalp Mode tracking
ALTER TABLE telegram_channel_calls 
ADD COLUMN IF NOT EXISTS scalp_validation_result JSONB,
ADD COLUMN IF NOT EXISTS scalp_approved BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS flipit_position_id UUID REFERENCES flip_positions(id);

-- Add index for querying scalp-approved calls
CREATE INDEX IF NOT EXISTS idx_telegram_channel_calls_scalp_approved 
ON telegram_channel_calls(scalp_approved) 
WHERE scalp_approved = true;