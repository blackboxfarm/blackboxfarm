
-- Table: hunter_tweet_findings
-- Stores scraped tweets from hunter targets that contain token addresses
CREATE TABLE public.hunter_tweet_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid REFERENCES public.twitter_tg_targets(id) ON DELETE CASCADE NOT NULL,
  handle text NOT NULL,
  tweet_id text NOT NULL UNIQUE,
  tweet_text text NOT NULL,
  tweet_url text,
  detected_tokens jsonb DEFAULT '[]'::jsonb,
  detected_tickers jsonb DEFAULT '[]'::jsonb,
  tweet_date timestamptz,
  engagement_score integer DEFAULT 0,
  reply_drafted boolean DEFAULT false,
  reply_posted boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.hunter_tweet_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on hunter_tweet_findings"
  ON public.hunter_tweet_findings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_hunter_tweet_findings_target ON public.hunter_tweet_findings (target_id);
CREATE INDEX idx_hunter_tweet_findings_handle ON public.hunter_tweet_findings (handle);
CREATE INDEX idx_hunter_tweet_findings_date ON public.hunter_tweet_findings (tweet_date DESC);
CREATE INDEX idx_hunter_tweet_findings_tokens ON public.hunter_tweet_findings USING gin (detected_tokens);

-- Add columns to twitter_tg_targets for TG group tracking and scrape scheduling
ALTER TABLE public.twitter_tg_targets
  ADD COLUMN IF NOT EXISTS tg_group_joined boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tg_group_chat_id text,
  ADD COLUMN IF NOT EXISTS last_tweet_scan_at timestamptz,
  ADD COLUMN IF NOT EXISTS tweet_scan_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS token_mentions_found integer DEFAULT 0;
