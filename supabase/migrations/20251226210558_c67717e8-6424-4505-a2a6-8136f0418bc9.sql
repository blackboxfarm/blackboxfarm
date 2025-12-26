-- Add additional enrichment columns to twitter_accounts
ALTER TABLE public.twitter_accounts 
  ADD COLUMN IF NOT EXISTS verified_type TEXT,
  ADD COLUMN IF NOT EXISTS can_dm BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_media_tag BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fast_followers_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_custom_timelines BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_translator BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS professional_type TEXT,
  ADD COLUMN IF NOT EXISTS professional_category TEXT[],
  ADD COLUMN IF NOT EXISTS bio_urls JSONB,
  ADD COLUMN IF NOT EXISTS profile_urls JSONB,
  ADD COLUMN IF NOT EXISTS withheld_countries TEXT[];

-- Add comments for documentation
COMMENT ON COLUMN public.twitter_accounts.verified_type IS 'Type of verification: business, government, none';
COMMENT ON COLUMN public.twitter_accounts.can_dm IS 'Whether the account accepts direct messages';
COMMENT ON COLUMN public.twitter_accounts.professional_type IS 'Professional account type from Twitter';
COMMENT ON COLUMN public.twitter_accounts.bio_urls IS 'URLs extracted from bio';
COMMENT ON COLUMN public.twitter_accounts.profile_urls IS 'URLs from profile link';