-- Add launchpad column to token_lifecycle table
ALTER TABLE token_lifecycle 
ADD COLUMN IF NOT EXISTS launchpad TEXT;

-- Add launchpad column to scraped_tokens table
ALTER TABLE scraped_tokens 
ADD COLUMN IF NOT EXISTS launchpad TEXT;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_token_lifecycle_launchpad ON token_lifecycle(launchpad);
CREATE INDEX IF NOT EXISTS idx_scraped_tokens_launchpad ON scraped_tokens(launchpad);