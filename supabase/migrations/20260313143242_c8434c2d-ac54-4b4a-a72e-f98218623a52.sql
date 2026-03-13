ALTER TABLE public.pumpfun_monitor_config 
ADD COLUMN IF NOT EXISTS community_enricher_is_enabled boolean NOT NULL DEFAULT true;