-- Add auto_monitor_enabled column to persist the browser refresh toggle state
ALTER TABLE telegram_channel_config
ADD COLUMN IF NOT EXISTS auto_monitor_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN telegram_channel_config.auto_monitor_enabled IS 'Persists the Auto-Monitor browser refresh toggle state across page loads';