ALTER TABLE pumpfun_monitor_config 
ADD COLUMN IF NOT EXISTS monitor_is_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS enricher_is_enabled boolean NOT NULL DEFAULT true;

UPDATE pumpfun_monitor_config SET monitor_is_enabled = is_enabled, enricher_is_enabled = is_enabled;