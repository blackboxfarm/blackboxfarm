-- Twitter Token Mentions table for storing discovered mentions
CREATE TABLE public.twitter_token_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id TEXT UNIQUE NOT NULL,
  tweet_text TEXT NOT NULL,
  tweet_url TEXT,
  author_username TEXT,
  author_id TEXT,
  author_followers INT DEFAULT 0,
  detected_contracts TEXT[] DEFAULT '{}',
  detected_tickers TEXT[] DEFAULT '{}',
  engagement_score INT DEFAULT 0,
  likes_count INT DEFAULT 0,
  retweets_count INT DEFAULT 0,
  replies_count INT DEFAULT 0,
  posted_at TIMESTAMPTZ,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  queued_for_analysis BOOLEAN DEFAULT FALSE,
  queue_id UUID REFERENCES public.holders_intel_post_queue(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient contract lookups
CREATE INDEX idx_twitter_mentions_contracts ON public.twitter_token_mentions USING GIN(detected_contracts);

-- Index for recent posts
CREATE INDEX idx_twitter_mentions_posted ON public.twitter_token_mentions(posted_at DESC);

-- Index for high-engagement discovery
CREATE INDEX idx_twitter_mentions_engagement ON public.twitter_token_mentions(engagement_score DESC);

-- Index for finding unqueued mentions
CREATE INDEX idx_twitter_mentions_queued ON public.twitter_token_mentions(queued_for_analysis) WHERE queued_for_analysis = FALSE;

-- Enable RLS
ALTER TABLE public.twitter_token_mentions ENABLE ROW LEVEL SECURITY;

-- Allow public read access (this is public Twitter data)
CREATE POLICY "Allow public read access to twitter mentions"
ON public.twitter_token_mentions
FOR SELECT
USING (true);

-- Only service role can insert/update (edge functions)
CREATE POLICY "Service role can manage twitter mentions"
ON public.twitter_token_mentions
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');