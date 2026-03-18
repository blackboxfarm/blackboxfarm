
-- Add unique constraint for spider_run_metrics upserts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spider_run_metrics_run_date_key') THEN
    ALTER TABLE public.spider_run_metrics ADD CONSTRAINT spider_run_metrics_run_date_key UNIQUE (run_date);
  END IF;
END $$;

-- Create increment function for spider metrics (atomic counter updates)
CREATE OR REPLACE FUNCTION public.increment_spider_metrics(
  p_date date,
  p_tokens int DEFAULT 0,
  p_wallets int DEFAULT 0,
  p_mesh_links int DEFAULT 0,
  p_blacklist_hits int DEFAULT 0,
  p_whitelist_hits int DEFAULT 0,
  p_genealogy_depth int DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO spider_run_metrics (run_date, tokens_spidered, wallets_discovered, mesh_links_added, blacklist_hits, whitelist_hits, avg_genealogy_depth)
  VALUES (p_date, p_tokens, p_wallets, p_mesh_links, p_blacklist_hits, p_whitelist_hits, p_genealogy_depth)
  ON CONFLICT (run_date) DO UPDATE SET
    tokens_spidered = spider_run_metrics.tokens_spidered + p_tokens,
    wallets_discovered = spider_run_metrics.wallets_discovered + p_wallets,
    mesh_links_added = spider_run_metrics.mesh_links_added + p_mesh_links,
    blacklist_hits = spider_run_metrics.blacklist_hits + p_blacklist_hits,
    whitelist_hits = spider_run_metrics.whitelist_hits + p_whitelist_hits,
    avg_genealogy_depth = GREATEST(spider_run_metrics.avg_genealogy_depth, p_genealogy_depth);
END;
$$;

-- Create increment function for token funnel (atomic counter updates)
CREATE OR REPLACE FUNCTION public.increment_funnel_stage(
  p_date date,
  p_stage text,
  p_count int DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO token_funnel_daily (funnel_date, stage, token_count)
  VALUES (p_date, p_stage, p_count)
  ON CONFLICT (funnel_date, stage) DO UPDATE SET
    token_count = token_funnel_daily.token_count + p_count;
END;
$$;
