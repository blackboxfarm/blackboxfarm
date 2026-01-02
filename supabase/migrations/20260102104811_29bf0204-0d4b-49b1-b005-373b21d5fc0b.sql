-- ============================================================
-- FANTASY TRADE LEARNING SYSTEM - Database Schema Updates
-- ============================================================

-- 1. Add entry snapshot columns to pumpfun_fantasy_positions
-- These capture the conditions at the moment of entry for AI learning

ALTER TABLE pumpfun_fantasy_positions
ADD COLUMN IF NOT EXISTS entry_market_cap_usd NUMERIC,
ADD COLUMN IF NOT EXISTS entry_holder_count INTEGER,
ADD COLUMN IF NOT EXISTS entry_volume_24h_sol NUMERIC,
ADD COLUMN IF NOT EXISTS entry_token_age_mins INTEGER,
ADD COLUMN IF NOT EXISTS entry_bonding_curve_pct NUMERIC,
ADD COLUMN IF NOT EXISTS entry_rugcheck_score INTEGER,
ADD COLUMN IF NOT EXISTS entry_signal_strength_raw TEXT,
ADD COLUMN IF NOT EXISTS entry_socials_count INTEGER;

-- 2. Add outcome classification columns
ALTER TABLE pumpfun_fantasy_positions
ADD COLUMN IF NOT EXISTS outcome TEXT, -- 'success', 'partial_win', 'loss', 'rug', 'slow_bleed'
ADD COLUMN IF NOT EXISTS outcome_classified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS outcome_notes TEXT;

-- 3. Add what-if analysis columns  
ALTER TABLE pumpfun_fantasy_positions
ADD COLUMN IF NOT EXISTS optimal_entry_market_cap NUMERIC,
ADD COLUMN IF NOT EXISTS optimal_exit_multiplier NUMERIC,
ADD COLUMN IF NOT EXISTS time_to_peak_mins INTEGER,
ADD COLUMN IF NOT EXISTS time_to_rug_mins INTEGER;

-- ============================================================
-- 4. Create pumpfun_trade_learnings table for AI training data
-- ============================================================

CREATE TABLE IF NOT EXISTS pumpfun_trade_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_position_id UUID REFERENCES pumpfun_fantasy_positions(id) ON DELETE CASCADE,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  
  -- Entry conditions snapshot
  entry_market_cap_usd NUMERIC,
  entry_holder_count INTEGER,
  entry_volume_sol NUMERIC,
  entry_token_age_mins INTEGER,
  entry_signal_strength TEXT,
  entry_rugcheck_score INTEGER,
  entry_bonding_curve_pct NUMERIC,
  
  -- Outcome
  outcome TEXT NOT NULL, -- success, partial_win, loss, rug, slow_bleed
  final_pnl_percent NUMERIC,
  peak_multiplier NUMERIC,
  time_to_peak_mins INTEGER,
  time_to_exit_mins INTEGER,
  
  -- Learning signals
  correct_signals TEXT[], -- What signals were RIGHT
  wrong_signals TEXT[],   -- What signals were WRONG
  
  -- Optimal parameters (calculated from this trade)
  optimal_market_cap_min NUMERIC,
  optimal_market_cap_max NUMERIC,
  optimal_holder_count_min INTEGER,
  optimal_holder_count_max INTEGER,
  should_have_avoided BOOLEAN DEFAULT FALSE,
  
  -- Notes
  analysis_notes TEXT,
  ai_insights TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient querying by outcome
CREATE INDEX IF NOT EXISTS idx_trade_learnings_outcome ON pumpfun_trade_learnings(outcome);
CREATE INDEX IF NOT EXISTS idx_trade_learnings_token ON pumpfun_trade_learnings(token_mint);

-- Enable RLS
ALTER TABLE pumpfun_trade_learnings ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions)
CREATE POLICY "Service role has full access to trade learnings"
ON pumpfun_trade_learnings
FOR ALL
USING (true)
WITH CHECK (true);

-- Add comment
COMMENT ON TABLE pumpfun_trade_learnings IS 'Structured learning data from fantasy trades for AI training and pattern recognition';