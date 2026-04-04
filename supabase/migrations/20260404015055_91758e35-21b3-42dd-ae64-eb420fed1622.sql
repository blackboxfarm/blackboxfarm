
-- Meta tags configuration table for sitewide, per-page, and per-article OG/SEO overrides
CREATE TABLE public.meta_tags_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'sitewide' CHECK (scope IN ('sitewide', 'page', 'article')),
  route_path TEXT, -- e.g., '/holders', '/pricing' (for page scope)
  article_slug TEXT, -- for article scope
  og_title TEXT,
  og_description TEXT,
  og_image_url TEXT,
  og_url TEXT,
  og_type TEXT DEFAULT 'website',
  twitter_card TEXT DEFAULT 'summary_large_image',
  twitter_title TEXT,
  twitter_description TEXT,
  twitter_image TEXT,
  canonical_url TEXT,
  extra_meta JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index: only one active config per scope+route+article
CREATE UNIQUE INDEX idx_meta_tags_sitewide ON public.meta_tags_config (scope) WHERE scope = 'sitewide' AND is_active = true;
CREATE UNIQUE INDEX idx_meta_tags_page ON public.meta_tags_config (scope, route_path) WHERE scope = 'page' AND is_active = true;
CREATE UNIQUE INDEX idx_meta_tags_article ON public.meta_tags_config (scope, article_slug) WHERE scope = 'article' AND is_active = true;

-- Enable RLS
ALTER TABLE public.meta_tags_config ENABLE ROW LEVEL SECURITY;

-- Public read (crawlers/edge functions need this)
CREATE POLICY "Anyone can read active meta tags"
  ON public.meta_tags_config FOR SELECT
  USING (is_active = true);

-- Authenticated write
CREATE POLICY "Authenticated users can insert meta tags"
  ON public.meta_tags_config FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update meta tags"
  ON public.meta_tags_config FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete meta tags"
  ON public.meta_tags_config FOR DELETE
  TO authenticated USING (true);

-- Auto-update timestamp trigger
CREATE TRIGGER update_meta_tags_config_updated_at
  BEFORE UPDATE ON public.meta_tags_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
