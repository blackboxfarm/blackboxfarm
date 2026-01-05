-- Add pattern tracking columns to dev_wallet_reputation
ALTER TABLE dev_wallet_reputation
ADD COLUMN IF NOT EXISTS pattern_diamond_dev INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pattern_hidden_whale INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pattern_wash_bundler INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pattern_buyback_dev INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pattern_wallet_washer INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pattern_spike_kill INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS linked_wallets TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS avg_insider_pct NUMERIC DEFAULT 0;

-- Add buy guardrail columns to pumpfun_watchlist
ALTER TABLE pumpfun_watchlist
ADD COLUMN IF NOT EXISTS price_at_mint NUMERIC,
ADD COLUMN IF NOT EXISTS price_peak NUMERIC,
ADD COLUMN IF NOT EXISTS price_current NUMERIC,
ADD COLUMN IF NOT EXISTS was_spiked_and_killed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS dev_holding_pct NUMERIC,
ADD COLUMN IF NOT EXISTS dev_bought_back BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS dev_secondary_wallets TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS first_10_buys_analyzed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS insider_pct NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_to_peak_mins NUMERIC,
ADD COLUMN IF NOT EXISTS spike_detected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS crash_detected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS detected_dev_pattern TEXT;

-- Create token_early_trades table for first 10-20 trade analysis
CREATE TABLE IF NOT EXISTS token_early_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint TEXT NOT NULL,
  trade_index INTEGER NOT NULL,
  wallet_address TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  sol_amount NUMERIC,
  token_amount NUMERIC,
  pct_supply_bought NUMERIC,
  timestamp TIMESTAMPTZ NOT NULL,
  is_creator BOOLEAN DEFAULT false,
  is_linked_to_creator BOOLEAN DEFAULT false,
  funding_source TEXT,
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_token_early_trades_mint ON token_early_trades(token_mint);
CREATE INDEX IF NOT EXISTS idx_token_early_trades_wallet ON token_early_trades(wallet_address);
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_early_trades_unique ON token_early_trades(token_mint, trade_index);

-- Enable RLS
ALTER TABLE token_early_trades ENABLE ROW LEVEL SECURITY;

-- Allow public read for early trades analysis
CREATE POLICY "Allow public read for token_early_trades"
ON token_early_trades FOR SELECT
USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role insert/update for token_early_trades"
ON token_early_trades FOR ALL
USING (true)
WITH CHECK (true);