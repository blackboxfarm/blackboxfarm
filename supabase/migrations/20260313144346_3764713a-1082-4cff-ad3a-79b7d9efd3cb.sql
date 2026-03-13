ALTER TABLE public.pumpfun_monitor_config 
ADD COLUMN IF NOT EXISTS social_mesh_linker_is_enabled boolean NOT NULL DEFAULT true;