-- Create tweet quota tracking table
CREATE TABLE public.flipit_tweet_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  tweet_count INT DEFAULT 0,
  last_tweet_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flipit_tweet_quota ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role has full access to tweet quota"
ON public.flipit_tweet_quota
FOR ALL
USING (true)
WITH CHECK (true);

-- Create tweet settings table for configurable limits
CREATE TABLE public.flipit_tweet_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_tweet_limit INT DEFAULT 40,
  min_profit_to_tweet NUMERIC DEFAULT 20,
  tweet_cooldown_minutes INT DEFAULT 30,
  tweets_enabled BOOLEAN DEFAULT true,
  skip_rebuy_tweets BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flipit_tweet_settings ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to tweet settings"
ON public.flipit_tweet_settings
FOR ALL
USING (true)
WITH CHECK (true);

-- Insert default settings
INSERT INTO public.flipit_tweet_settings (daily_tweet_limit, min_profit_to_tweet, tweet_cooldown_minutes, tweets_enabled, skip_rebuy_tweets)
VALUES (40, 20, 30, true, true);

-- Create index for efficient date lookups
CREATE INDEX idx_flipit_tweet_quota_date ON public.flipit_tweet_quota(date);