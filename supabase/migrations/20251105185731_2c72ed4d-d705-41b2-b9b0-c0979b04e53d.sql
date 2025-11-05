-- Add validation status tracking to scraped_tokens table
ALTER TABLE scraped_tokens 
ADD COLUMN IF NOT EXISTS validation_status text CHECK (validation_status IN ('pending', 'valid', 'invalid', 'not_found')) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS validation_error text,
ADD COLUMN IF NOT EXISTS last_validation_attempt timestamptz,
ADD COLUMN IF NOT EXISTS validation_attempts integer DEFAULT 0;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_scraped_tokens_validation_status ON scraped_tokens(validation_status);

-- Comment on columns
COMMENT ON COLUMN scraped_tokens.validation_status IS 'Status of token validation: pending (not checked), valid (found), invalid (error), not_found (404)';
COMMENT ON COLUMN scraped_tokens.validation_error IS 'Details of validation error if any';
COMMENT ON COLUMN scraped_tokens.last_validation_attempt IS 'Timestamp of last validation attempt';
COMMENT ON COLUMN scraped_tokens.validation_attempts IS 'Number of times validation was attempted';