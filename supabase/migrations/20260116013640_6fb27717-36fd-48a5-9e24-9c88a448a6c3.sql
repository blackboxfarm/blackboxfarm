-- Add Twitter/X API credential columns to twitter_accounts table
ALTER TABLE public.twitter_accounts
ADD COLUMN IF NOT EXISTS api_key_encrypted text,
ADD COLUMN IF NOT EXISTS api_secret_encrypted text,
ADD COLUMN IF NOT EXISTS access_token_encrypted text,
ADD COLUMN IF NOT EXISTS access_token_secret_encrypted text;