
-- Funnel Feed Sources: Telegram channels/groups to scrape for token addresses
CREATE TABLE public.funnel_feed_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL DEFAULT 'telegram_channel', -- telegram_channel, telegram_group
  source_id TEXT NOT NULL, -- Telegram channel/group ID (numeric)
  source_name TEXT NOT NULL, -- Human-readable name
  is_active BOOLEAN NOT NULL DEFAULT true,
  scrape_interval_minutes INTEGER NOT NULL DEFAULT 5,
  last_scraped_at TIMESTAMPTZ,
  last_message_id BIGINT DEFAULT 0, -- Track last processed message to avoid re-scraping
  tokens_discovered INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id)
);

ALTER TABLE public.funnel_feed_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage funnel feed sources"
ON public.funnel_feed_sources FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Funnel Feed Discoveries: Tokens found by scraping feeds
CREATE TABLE public.funnel_feed_discoveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  source_id UUID REFERENCES public.funnel_feed_sources(id) ON DELETE SET NULL,
  source_message_id BIGINT, -- Telegram message ID where it was found
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Pipeline status tracking
  mesh_status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  mesh_processed_at TIMESTAMPTZ,
  xpost_status TEXT NOT NULL DEFAULT 'pending', -- pending, already_seen, queued, posted, skipped
  xpost_processed_at TIMESTAMPTZ,
  watchlist_status TEXT NOT NULL DEFAULT 'pending', -- pending, inserted, already_exists, skipped
  watchlist_processed_at TIMESTAMPTZ,
  
  -- Enrichment data
  creator_wallet TEXT,
  dex_data JSONB,
  
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(token_mint, source_id)
);

ALTER TABLE public.funnel_feed_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage funnel feed discoveries"
ON public.funnel_feed_discoveries FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Indexes for performance
CREATE INDEX idx_funnel_discoveries_status ON public.funnel_feed_discoveries(mesh_status, xpost_status);
CREATE INDEX idx_funnel_discoveries_mint ON public.funnel_feed_discoveries(token_mint);
CREATE INDEX idx_funnel_discoveries_source ON public.funnel_feed_discoveries(source_id);
CREATE INDEX idx_funnel_sources_active ON public.funnel_feed_sources(is_active) WHERE is_active = true;

-- Updated_at trigger for sources
CREATE TRIGGER update_funnel_feed_sources_updated_at
BEFORE UPDATE ON public.funnel_feed_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
