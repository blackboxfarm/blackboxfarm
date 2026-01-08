-- Add whale tracking to fantasy positions
ALTER TABLE telegram_fantasy_positions 
ADD COLUMN IF NOT EXISTS whale_name TEXT,
ADD COLUMN IF NOT EXISTS whale_call_sequence INTEGER,
ADD COLUMN IF NOT EXISTS was_first_whale BOOLEAN DEFAULT false;

-- Create whale performance stats table
CREATE TABLE IF NOT EXISTS telegram_whale_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whale_name TEXT NOT NULL UNIQUE,
  channel_config_id UUID REFERENCES telegram_channel_config(id),
  total_calls INTEGER DEFAULT 0,
  first_calls INTEGER DEFAULT 0,
  winning_calls INTEGER DEFAULT 0,
  losing_calls INTEGER DEFAULT 0,
  total_pnl_usd NUMERIC DEFAULT 0,
  avg_entry_curve_percent NUMERIC,
  avg_exit_multiplier NUMERIC,
  best_call_token TEXT,
  best_call_pnl_percent NUMERIC,
  worst_call_token TEXT,
  worst_call_pnl_percent NUMERIC,
  avg_time_to_peak_minutes NUMERIC,
  graduated_tokens INTEGER DEFAULT 0,
  dead_tokens INTEGER DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_call_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE telegram_whale_stats ENABLE ROW LEVEL SECURITY;

-- Allow all access (admin table)
CREATE POLICY "Allow all access to whale stats" ON telegram_whale_stats
  FOR ALL USING (true) WITH CHECK (true);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_whale_stats_name ON telegram_whale_stats(whale_name);
CREATE INDEX IF NOT EXISTS idx_positions_whale ON telegram_fantasy_positions(whale_name);

-- Add curve position tracking to interpretations
ALTER TABLE telegram_message_interpretations
ADD COLUMN IF NOT EXISTS curve_percent_at_call NUMERIC,
ADD COLUMN IF NOT EXISTS bonding_graduated BOOLEAN DEFAULT false;