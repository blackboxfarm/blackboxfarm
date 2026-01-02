-- Add missing config columns to pumpfun_monitor_config
ALTER TABLE public.pumpfun_monitor_config 
ADD COLUMN IF NOT EXISTS min_watch_time_minutes INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS max_watch_time_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS qualification_holder_count INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS qualification_volume_sol NUMERIC DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS dead_holder_threshold INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS dead_volume_threshold_sol NUMERIC DEFAULT 0.01,
ADD COLUMN IF NOT EXISTS signal_strong_holder_threshold INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS signal_strong_volume_threshold_sol NUMERIC DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS signal_strong_rugcheck_threshold INTEGER DEFAULT 70;

-- Add last_dev_check_at to pumpfun_watchlist
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS last_dev_check_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS signal_strength TEXT DEFAULT 'weak';

-- Add signal_strength index for filtering
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_signal_strength 
ON public.pumpfun_watchlist(signal_strength) 
WHERE status = 'qualified';

COMMENT ON COLUMN public.pumpfun_monitor_config.min_watch_time_minutes IS 'Minimum minutes watching before qualification';
COMMENT ON COLUMN public.pumpfun_monitor_config.max_watch_time_minutes IS 'Maximum minutes before marking dead if not qualified';
COMMENT ON COLUMN public.pumpfun_monitor_config.qualification_holder_count IS 'Minimum holders for qualification';
COMMENT ON COLUMN public.pumpfun_monitor_config.qualification_volume_sol IS 'Minimum 24h volume in SOL for qualification';
COMMENT ON COLUMN public.pumpfun_monitor_config.dead_holder_threshold IS 'Below this holder count = dead';
COMMENT ON COLUMN public.pumpfun_monitor_config.dead_volume_threshold_sol IS 'Below this volume = dead';
COMMENT ON COLUMN public.pumpfun_monitor_config.signal_strong_holder_threshold IS 'Holders needed for SIGNAL_STRONG classification';
COMMENT ON COLUMN public.pumpfun_monitor_config.signal_strong_volume_threshold_sol IS 'Volume needed for SIGNAL_STRONG classification';
COMMENT ON COLUMN public.pumpfun_monitor_config.signal_strong_rugcheck_threshold IS 'RugCheck score needed for SIGNAL_STRONG';
COMMENT ON COLUMN public.pumpfun_watchlist.last_dev_check_at IS 'Last time developer behavior was checked';
COMMENT ON COLUMN public.pumpfun_watchlist.signal_strength IS 'SIGNAL_STRONG or SIGNAL_WEAK classification';