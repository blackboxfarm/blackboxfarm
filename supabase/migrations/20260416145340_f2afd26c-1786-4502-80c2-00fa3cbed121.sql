
-- Create scrape log table
CREATE TABLE public.dex_scrape_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID REFERENCES public.dex_scrape_sources(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  source_label TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  pair_count INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX idx_dex_scrape_log_created_at ON public.dex_scrape_log(created_at DESC);
CREATE INDEX idx_dex_scrape_log_source_id ON public.dex_scrape_log(source_id);

-- Enable RLS
ALTER TABLE public.dex_scrape_log ENABLE ROW LEVEL SECURITY;

-- Super admins can read
CREATE POLICY "Super admins can view scrape logs"
  ON public.dex_scrape_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role inserts (edge functions use service role, bypasses RLS)

-- Create config table for polling interval
CREATE TABLE public.dex_scrape_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dex_scrape_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view scrape config"
  ON public.dex_scrape_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins can update scrape config"
  ON public.dex_scrape_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed default polling interval
INSERT INTO public.dex_scrape_config (key, value)
VALUES ('polling_interval', '{"interval_minutes": 30}'::jsonb);

-- Auto-prune logs older than 7 days (daily cron)
SELECT cron.schedule(
  'prune-dex-scrape-log',
  '0 3 * * *',
  $$DELETE FROM public.dex_scrape_log WHERE created_at < now() - interval '7 days'$$
);
