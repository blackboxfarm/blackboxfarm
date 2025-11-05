-- Create table for invalid scraped tokens
CREATE TABLE IF NOT EXISTS invalid_scraped_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  symbol text,
  name text,
  discovery_source text NOT NULL,
  rank_snapshot integer,
  scraped_at timestamp with time zone DEFAULT now(),
  validation_status text NOT NULL,
  validation_error text,
  last_validation_attempt timestamp with time zone,
  validation_attempts integer DEFAULT 0,
  moved_at timestamp with time zone DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_invalid_scraped_tokens_token_mint ON invalid_scraped_tokens(token_mint);
CREATE INDEX idx_invalid_scraped_tokens_validation_status ON invalid_scraped_tokens(validation_status);

-- Enable RLS
ALTER TABLE invalid_scraped_tokens ENABLE ROW LEVEL SECURITY;

-- Super admins can view invalid tokens
CREATE POLICY "Super admins can view invalid tokens"
  ON invalid_scraped_tokens
  FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()));

-- Service role can manage invalid tokens
CREATE POLICY "Service role can manage invalid tokens"
  ON invalid_scraped_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);