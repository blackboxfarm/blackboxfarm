-- Add trading_mode column to telegram_channel_config
ALTER TABLE telegram_channel_config 
ADD COLUMN IF NOT EXISTS trading_mode TEXT DEFAULT 'simple' 
CHECK (trading_mode IN ('simple', 'advanced'));

-- Create trading_keywords table for managing degen keywords
CREATE TABLE IF NOT EXISTS trading_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'general',
  weight NUMERIC DEFAULT 1.0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on trading_keywords
ALTER TABLE trading_keywords ENABLE ROW LEVEL SECURITY;

-- Public read access for trading_keywords (they're global)
CREATE POLICY "Anyone can read trading keywords" 
ON trading_keywords FOR SELECT 
USING (true);

-- Only super admins can modify keywords (we'll check via app logic)
CREATE POLICY "Super admins can manage keywords" 
ON trading_keywords FOR ALL 
USING (true);

-- Create trading_rules table for advanced trading logic
CREATE TABLE IF NOT EXISTS trading_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  channel_id UUID REFERENCES telegram_channel_config(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  
  -- Keyword Conditions
  required_keywords TEXT[] DEFAULT '{}',
  excluded_keywords TEXT[] DEFAULT '{}',
  min_keyword_weight NUMERIC,
  
  -- Price Conditions (USD)
  min_price_usd NUMERIC,
  max_price_usd NUMERIC,
  
  -- Bonding Curve Conditions
  bonding_curve_position TEXT CHECK (bonding_curve_position IN ('early', 'mid', 'late', 'graduated', 'any')),
  min_bonding_pct NUMERIC,
  max_bonding_pct NUMERIC,
  require_on_curve BOOLEAN,
  require_graduated BOOLEAN,
  
  -- Age Conditions
  min_age_minutes INTEGER,
  max_age_minutes INTEGER,
  
  -- Market Cap Conditions
  min_market_cap_usd NUMERIC,
  max_market_cap_usd NUMERIC,
  
  -- Platform Conditions
  platforms TEXT[] DEFAULT '{}',
  
  -- Price Velocity
  price_change_5m_min NUMERIC,
  price_change_5m_max NUMERIC,
  
  -- Actions
  buy_amount_usd NUMERIC NOT NULL DEFAULT 50,
  sell_target_multiplier NUMERIC DEFAULT 2.0,
  stop_loss_pct NUMERIC,
  stop_loss_enabled BOOLEAN DEFAULT false,
  
  -- Fallback
  fallback_to_fantasy BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on trading_rules
ALTER TABLE trading_rules ENABLE ROW LEVEL SECURITY;

-- Users can read all rules (global and their own)
CREATE POLICY "Anyone can read trading rules" 
ON trading_rules FOR SELECT 
USING (true);

-- Super admins can manage all rules
CREATE POLICY "Super admins can manage rules" 
ON trading_rules FOR ALL 
USING (true);

-- Add stop loss fields to telegram_fantasy_positions
ALTER TABLE telegram_fantasy_positions
ADD COLUMN IF NOT EXISTS stop_loss_pct NUMERIC,
ADD COLUMN IF NOT EXISTS stop_loss_triggered BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS rule_id UUID REFERENCES trading_rules(id);

-- Seed default trading keywords
INSERT INTO trading_keywords (keyword, category, weight) VALUES
  -- High Conviction
  ('ape', 'high_conviction', 2.0),
  ('apeing', 'high_conviction', 2.0),
  ('send it', 'high_conviction', 1.8),
  ('full send', 'high_conviction', 1.8),
  ('all in', 'high_conviction', 1.7),
  ('lfg', 'high_conviction', 1.6),
  
  -- Bullish
  ('degen', 'bullish', 1.5),
  ('early', 'bullish', 1.5),
  ('gem', 'bullish', 1.3),
  ('moon', 'bullish', 1.2),
  ('pump', 'bullish', 1.2),
  ('buy the dip', 'bullish', 1.4),
  ('new', 'bullish', 1.0),
  ('fresh', 'bullish', 1.1),
  ('alpha', 'bullish', 1.3),
  ('insider', 'bullish', 1.4),
  ('wagmi', 'bullish', 0.8),
  ('bullish', 'bullish', 1.2),
  ('easy', 'bullish', 1.0),
  ('free money', 'bullish', 1.5),
  
  -- FOMO
  ('100x', 'fomo', 1.5),
  ('10x', 'fomo', 1.2),
  ('1000x', 'fomo', 1.6),
  ('fomo', 'fomo', 1.3),
  ('dont miss', 'fomo', 1.4),
  ('last chance', 'fomo', 1.3),
  
  -- Caution
  ('dip', 'caution', 0.8),
  ('gamble', 'caution', 0.7),
  ('risky', 'caution', 0.5),
  ('nfa', 'caution', 0.6),
  ('dyor', 'caution', 0.5),
  
  -- Bearish
  ('scam', 'bearish', -1.0),
  ('rug', 'bearish', -2.0),
  ('dump', 'bearish', -1.5),
  ('jeet', 'bearish', -0.5),
  ('ngmi', 'bearish', -0.3),
  ('sell', 'bearish', -0.5),
  ('exit', 'bearish', -0.7),
  ('honeypot', 'bearish', -2.0)
ON CONFLICT (keyword) DO NOTHING;

-- Seed default trading rules
INSERT INTO trading_rules (name, description, priority, required_keywords, max_price_usd, bonding_curve_position, max_bonding_pct, buy_amount_usd, sell_target_multiplier, stop_loss_pct, stop_loss_enabled) VALUES
  ('APE Full Send', 'High conviction APE calls on early curve tokens', 10, ARRAY['ape', 'apeing'], 0.00002, 'early', 25, 100, 10.0, 50, true),
  ('Early Degen Play', 'Fresh tokens with bullish keywords', 20, ARRAY['degen', 'early', 'gem', 'alpha'], 0.0001, 'early', 50, 50, 5.0, 40, true),
  ('Graduated Runner', 'Tokens that graduated with momentum', 30, ARRAY['moon', 'pump', 'bullish'], NULL, 'graduated', NULL, 25, 2.0, 30, true),
  ('Gamble Mode', 'Small bets on risky plays', 40, ARRAY['gamble', 'risky'], NULL, 'any', NULL, 10, 2.0, 50, true),
  ('FOMO Filter', 'Catch FOMO plays with caution', 50, ARRAY['fomo', '100x', '10x'], 0.0005, 'any', NULL, 20, 3.0, 60, true)
ON CONFLICT DO NOTHING;

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_trading_keywords_updated_at ON trading_keywords;
CREATE TRIGGER update_trading_keywords_updated_at
    BEFORE UPDATE ON trading_keywords
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_trading_rules_updated_at ON trading_rules;
CREATE TRIGGER update_trading_rules_updated_at
    BEFORE UPDATE ON trading_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();