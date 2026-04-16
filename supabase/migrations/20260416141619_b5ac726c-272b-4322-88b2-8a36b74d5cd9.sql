
-- Create dex_scrape_sources table
CREATE TABLE public.dex_scrape_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_page2 BOOLEAN NOT NULL DEFAULT false,
  wait_ms INT[] NOT NULL DEFAULT '{3000,5000,8000}',
  last_scraped_at TIMESTAMPTZ,
  last_pair_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dex_scrape_sources ENABLE ROW LEVEL SECURITY;

-- Super admin policies
CREATE POLICY "Super admins can view scrape sources"
  ON public.dex_scrape_sources FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert scrape sources"
  ON public.dex_scrape_sources FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update scrape sources"
  ON public.dex_scrape_sources FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete scrape sources"
  ON public.dex_scrape_sources FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Updated_at trigger
CREATE TRIGGER update_dex_scrape_sources_updated_at
  BEFORE UPDATE ON public.dex_scrape_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed existing URLs
INSERT INTO public.dex_scrape_sources (url, label, sort_order, is_active, is_page2, wait_ms) VALUES
  ('https://dexscreener.com/solana', 'Solana Page 1', 1, true, false, '{3000,5000,8000}'),
  ('https://dexscreener.com/solana/page-2', 'Solana Page 2', 2, true, true, '{10000,15000,20000}');
