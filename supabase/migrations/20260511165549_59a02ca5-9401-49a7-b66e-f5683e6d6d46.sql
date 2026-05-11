
CREATE TABLE IF NOT EXISTS public.pumpfun_profile_scrape_log (
  wallet_address text PRIMARY KEY,
  last_scraped_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('browserless','apify','api')),
  coins_found integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pumpfun_profile_scrape_log_last
  ON public.pumpfun_profile_scrape_log (last_scraped_at DESC);

ALTER TABLE public.pumpfun_profile_scrape_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_scrape_log" ON public.pumpfun_profile_scrape_log;
CREATE POLICY "super_admin_read_scrape_log"
  ON public.pumpfun_profile_scrape_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
