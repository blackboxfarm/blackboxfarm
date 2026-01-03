-- Temporarily lower qualification thresholds for testing
UPDATE pumpfun_monitor_config 
SET 
  qualification_holder_count = 10,  -- Was 20, now 10
  qualification_volume_sol = 0.2,   -- Was 0.5, now 0.2
  min_watch_time_minutes = 1,       -- Was 2, now 1 (faster promotion)
  max_watch_time_minutes = 45,      -- Was 60, now 45 (faster dead marking)
  dead_holder_threshold = 5,        -- Was 3, now 5 (more aggressive dead marking)
  updated_at = NOW()
WHERE id = '07949bb2-a48c-4335-8740-cb72bee90b9d';