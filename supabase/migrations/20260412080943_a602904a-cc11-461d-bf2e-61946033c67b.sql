
-- Scraper provider config (singleton row for toggle control)
CREATE TABLE public.scraper_provider_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_primary TEXT NOT NULL DEFAULT 'browserless' CHECK (provider_primary IN ('browserless', 'firecrawl')),
  provider_fallback TEXT NOT NULL DEFAULT 'firecrawl' CHECK (provider_fallback IN ('browserless', 'firecrawl')),
  browserless_enabled BOOLEAN NOT NULL DEFAULT true,
  firecrawl_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_fallback_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scraper_provider_config ENABLE ROW LEVEL SECURITY;

-- Seed with default: Browserless primary, Firecrawl fallback
INSERT INTO public.scraper_provider_config (provider_primary, provider_fallback) VALUES ('browserless', 'firecrawl');

-- Scraper audit log for detailed tracking
CREATE TABLE public.scraper_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  provider_used TEXT NOT NULL,
  provider_was_primary BOOLEAN NOT NULL DEFAULT true,
  fell_back BOOLEAN NOT NULL DEFAULT false,
  fallback_provider TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  http_status INTEGER,
  response_time_ms INTEGER,
  response_size_bytes INTEGER,
  content_usable BOOLEAN,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scraper_audit_log ENABLE ROW LEVEL SECURITY;

-- Index for dashboard queries
CREATE INDEX idx_scraper_audit_function ON public.scraper_audit_log (function_name, created_at DESC);
CREATE INDEX idx_scraper_audit_provider ON public.scraper_audit_log (provider_used, created_at DESC);
CREATE INDEX idx_scraper_audit_success ON public.scraper_audit_log (success, created_at DESC);
