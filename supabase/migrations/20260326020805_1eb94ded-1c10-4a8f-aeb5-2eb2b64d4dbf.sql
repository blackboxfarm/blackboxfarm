-- Table to store EVERY URL discovered from mint metadata lookups
-- One row per URL per token per source — nothing wasted
CREATE TABLE public.token_social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  url text NOT NULL,
  link_type text NOT NULL DEFAULT 'unknown', -- x_community, x_handle, twitter, discord, telegram, website, github, other
  platform text, -- twitter, discord, telegram, github, tiktok, youtube, etc.
  extracted_handle text, -- e.g. @handle or community ID
  source text NOT NULL, -- dexscreener, pumpfun, solscan, bonkfun, bagsfm, helius, metaplex
  is_community boolean DEFAULT false,
  community_id text, -- extracted X community ID if applicable
  community_spidered boolean DEFAULT false,
  discovered_at timestamptz DEFAULT now(),
  UNIQUE(token_mint, url, source)
);

-- Index for fast lookups
CREATE INDEX idx_token_social_links_mint ON public.token_social_links(token_mint);
CREATE INDEX idx_token_social_links_type ON public.token_social_links(link_type);
CREATE INDEX idx_token_social_links_unspidered ON public.token_social_links(community_spidered) WHERE is_community = true AND community_spidered = false;
CREATE INDEX idx_token_social_links_platform ON public.token_social_links(platform);

-- Enable RLS
ALTER TABLE public.token_social_links ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role full access" ON public.token_social_links
  FOR ALL USING (true) WITH CHECK (true);
