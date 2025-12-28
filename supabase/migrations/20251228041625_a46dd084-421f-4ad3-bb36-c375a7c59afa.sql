-- Add caller tracking columns to telegram_channel_calls
ALTER TABLE telegram_channel_calls 
ADD COLUMN IF NOT EXISTS caller_username TEXT,
ADD COLUMN IF NOT EXISTS caller_display_name TEXT,
ADD COLUMN IF NOT EXISTS is_first_call BOOLEAN DEFAULT true;

-- Add caller tracking to telegram_message_interpretations
ALTER TABLE telegram_message_interpretations
ADD COLUMN IF NOT EXISTS caller_username TEXT,
ADD COLUMN IF NOT EXISTS caller_display_name TEXT;

-- Add caller tracking to fantasy positions
ALTER TABLE telegram_fantasy_positions
ADD COLUMN IF NOT EXISTS caller_username TEXT,
ADD COLUMN IF NOT EXISTS caller_display_name TEXT,
ADD COLUMN IF NOT EXISTS channel_name TEXT;

-- Create telegram_callers table for caller track records
CREATE TABLE IF NOT EXISTS telegram_callers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  channel_usernames TEXT[] DEFAULT '{}',
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  average_gain_percent NUMERIC DEFAULT 0,
  best_call_gain_percent NUMERIC,
  best_call_token_mint TEXT,
  best_call_token_symbol TEXT,
  worst_call_loss_percent NUMERIC,
  total_pnl_usd NUMERIC DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_call_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create unique index on token_mint to track first caller per token
CREATE INDEX IF NOT EXISTS idx_telegram_calls_token_first 
ON telegram_channel_calls (token_mint, created_at);

-- Create index for caller lookups
CREATE INDEX IF NOT EXISTS idx_telegram_calls_caller 
ON telegram_channel_calls (caller_username);

CREATE INDEX IF NOT EXISTS idx_telegram_callers_username 
ON telegram_callers (username);

-- Enable RLS
ALTER TABLE telegram_callers ENABLE ROW LEVEL SECURITY;

-- Allow read access (admin feature)
CREATE POLICY "Allow read access to telegram_callers"
ON telegram_callers FOR SELECT
USING (true);

-- Allow insert/update for service role
CREATE POLICY "Allow service insert to telegram_callers"
ON telegram_callers FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow service update to telegram_callers"
ON telegram_callers FOR UPDATE
USING (true);