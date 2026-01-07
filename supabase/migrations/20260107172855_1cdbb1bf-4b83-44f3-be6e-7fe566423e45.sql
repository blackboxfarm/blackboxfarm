-- Create table for KOL Twitter/X posts
CREATE TABLE public.pumpfun_kol_tweets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_id UUID REFERENCES public.pumpfun_kol_registry(id) ON DELETE CASCADE,
  kol_wallet TEXT NOT NULL,
  twitter_handle TEXT NOT NULL,
  
  -- Tweet content
  tweet_id TEXT UNIQUE NOT NULL,
  tweet_text TEXT NOT NULL,
  tweet_url TEXT,
  posted_at TIMESTAMPTZ NOT NULL,
  
  -- Engagement metrics
  likes_count INTEGER DEFAULT 0,
  retweets_count INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  
  -- Token detection
  detected_tickers TEXT[] DEFAULT '{}',
  detected_contracts TEXT[] DEFAULT '{}',
  detected_token_names TEXT[] DEFAULT '{}',
  
  -- Correlation with trading
  correlated_activity_id UUID REFERENCES public.pumpfun_kol_activity(id),
  correlation_type TEXT, -- 'pre_buy', 'during_buy', 'post_buy', 'pump_call', 'dump_warning'
  correlation_delta_mins INTEGER, -- Time between tweet and trade
  
  -- Classification
  tweet_type TEXT DEFAULT 'general', -- 'shill', 'alpha_call', 'buy_signal', 'sell_signal', 'fud', 'general'
  sentiment_score NUMERIC DEFAULT 0, -- -1 to 1
  is_token_promotion BOOLEAN DEFAULT false,
  
  -- Scanning metadata
  scanned_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_kol_tweets_kol_id ON public.pumpfun_kol_tweets(kol_id);
CREATE INDEX idx_kol_tweets_twitter_handle ON public.pumpfun_kol_tweets(twitter_handle);
CREATE INDEX idx_kol_tweets_posted_at ON public.pumpfun_kol_tweets(posted_at DESC);
CREATE INDEX idx_kol_tweets_detected_tickers ON public.pumpfun_kol_tweets USING GIN(detected_tickers);
CREATE INDEX idx_kol_tweets_detected_contracts ON public.pumpfun_kol_tweets USING GIN(detected_contracts);
CREATE INDEX idx_kol_tweets_correlation ON public.pumpfun_kol_tweets(correlated_activity_id) WHERE correlated_activity_id IS NOT NULL;

-- Add Twitter handle tracking to KOL registry if not exists
ALTER TABLE public.pumpfun_kol_registry 
ADD COLUMN IF NOT EXISTS twitter_last_scanned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS twitter_scan_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS total_tweets_scanned INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_token_mentions INTEGER DEFAULT 0;

-- RLS Policies
ALTER TABLE public.pumpfun_kol_tweets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read KOL tweets"
ON public.pumpfun_kol_tweets FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow service role full access to KOL tweets"
ON public.pumpfun_kol_tweets FOR ALL
TO service_role
USING (true)
WITH CHECK (true);