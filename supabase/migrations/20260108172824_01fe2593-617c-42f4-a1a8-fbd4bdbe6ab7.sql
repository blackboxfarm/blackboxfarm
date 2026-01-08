-- Add signal classification columns to telegram_message_interpretations
ALTER TABLE telegram_message_interpretations 
ADD COLUMN IF NOT EXISTS signal_type TEXT DEFAULT 'STANDARD',
ADD COLUMN IF NOT EXISTS whale_name TEXT,
ADD COLUMN IF NOT EXISTS whale_consensus_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS call_sequence INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS urgency_score NUMERIC DEFAULT 0.5;

-- Create index for efficient signal queries
CREATE INDEX IF NOT EXISTS idx_interpretations_signal_type ON telegram_message_interpretations(signal_type);
CREATE INDEX IF NOT EXISTS idx_interpretations_whale_name ON telegram_message_interpretations(whale_name);
CREATE INDEX IF NOT EXISTS idx_interpretations_token_created ON telegram_message_interpretations(token_mint, created_at DESC);

-- Create telegram_whale_profiles table for tracking whale performance
CREATE TABLE IF NOT EXISTS telegram_whale_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whale_name TEXT UNIQUE NOT NULL,
  total_calls INTEGER DEFAULT 0,
  profitable_calls INTEGER DEFAULT 0,
  success_rate NUMERIC DEFAULT 0,
  avg_roi NUMERIC DEFAULT 0,
  best_call_roi NUMERIC DEFAULT 0,
  worst_call_roi NUMERIC DEFAULT 0,
  total_pnl_usd NUMERIC DEFAULT 0,
  priority_tier TEXT DEFAULT 'STANDARD', -- VIP, STANDARD, LOW
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE telegram_whale_profiles ENABLE ROW LEVEL SECURITY;

-- Allow read access (public data for analytics)
CREATE POLICY "Allow read access to whale profiles"
ON telegram_whale_profiles FOR SELECT
USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to whale profiles"
ON telegram_whale_profiles FOR ALL
USING (true)
WITH CHECK (true);

-- Add signal-based trading config columns
ALTER TABLE telegram_channel_config
ADD COLUMN IF NOT EXISTS signal_classification_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS emergency_buy_multiplier NUMERIC DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS recommendation_buy_multiplier NUMERIC DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS momentum_buy_multiplier NUMERIC DEFAULT 1.25,
ADD COLUMN IF NOT EXISTS fresh_discovery_buy_multiplier NUMERIC DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS watch_mode_fantasy_only BOOLEAN DEFAULT true;

-- Create function to update whale profiles
CREATE OR REPLACE FUNCTION update_whale_profile_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Upsert whale profile when interpretation is created
  IF NEW.whale_name IS NOT NULL THEN
    INSERT INTO telegram_whale_profiles (whale_name, total_calls, last_seen_at)
    VALUES (NEW.whale_name, 1, now())
    ON CONFLICT (whale_name) 
    DO UPDATE SET 
      total_calls = telegram_whale_profiles.total_calls + 1,
      last_seen_at = now(),
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update whale profiles
DROP TRIGGER IF EXISTS trigger_update_whale_profile ON telegram_message_interpretations;
CREATE TRIGGER trigger_update_whale_profile
AFTER INSERT ON telegram_message_interpretations
FOR EACH ROW
EXECUTE FUNCTION update_whale_profile_stats();