-- Add session health tracking columns to telegram_mtproto_session
ALTER TABLE telegram_mtproto_session 
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS session_valid BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMP WITH TIME ZONE;

-- Create a distributed lock table to prevent concurrent MTProto access
CREATE TABLE IF NOT EXISTS telegram_monitor_lock (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  locked_by TEXT,
  locked_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Insert default lock row
INSERT INTO telegram_monitor_lock (id, locked_by, locked_at, expires_at)
VALUES ('singleton', NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE telegram_monitor_lock ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage lock" ON telegram_monitor_lock
FOR ALL USING (true) WITH CHECK (true);