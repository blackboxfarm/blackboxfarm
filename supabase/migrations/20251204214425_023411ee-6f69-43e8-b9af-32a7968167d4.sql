-- Add profit distribution wallet addresses to alert config
ALTER TABLE mega_whale_alert_config 
  ADD COLUMN IF NOT EXISTS distribution_wallet_1 TEXT,
  ADD COLUMN IF NOT EXISTS distribution_wallet_2 TEXT,
  ADD COLUMN IF NOT EXISTS distribution_wallet_3 TEXT,
  ADD COLUMN IF NOT EXISTS distribution_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS distribution_percent_per_wallet NUMERIC DEFAULT 10;

-- Add tracking for distributions
CREATE TABLE IF NOT EXISTS mega_whale_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trade_id UUID REFERENCES mega_whale_auto_trades(id),
  source_signature TEXT,
  total_profit_sol NUMERIC NOT NULL,
  distribution_amount_sol NUMERIC NOT NULL,
  wallet_1_address TEXT,
  wallet_1_signature TEXT,
  wallet_2_address TEXT,
  wallet_2_signature TEXT,
  wallet_3_address TEXT,
  wallet_3_signature TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE mega_whale_distributions ENABLE ROW LEVEL SECURITY;

-- RLS policy for distributions
CREATE POLICY "Users can view their own distributions"
  ON mega_whale_distributions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);