-- Store MTProto session securely
CREATE TABLE IF NOT EXISTS telegram_mtproto_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_string text NOT NULL,
  phone_number text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz
);

-- Enable RLS
ALTER TABLE telegram_mtproto_session ENABLE ROW LEVEL SECURITY;

-- Only service role can access (edge functions)
CREATE POLICY "Service role only" ON telegram_mtproto_session
  FOR ALL USING (false);

-- Add columns to channel config for MTProto
ALTER TABLE telegram_channel_config 
ADD COLUMN IF NOT EXISTS channel_type text DEFAULT 'channel',
ADD COLUMN IF NOT EXISTS entity_access_hash text;