-- Create table for tracking abused/spam tickers
CREATE TABLE public.abused_tickers (
  symbol TEXT PRIMARY KEY,
  abuse_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  is_permanent_block BOOLEAN DEFAULT FALSE,
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.abused_tickers ENABLE ROW LEVEL SECURITY;

-- Allow reading for authenticated users and service role
CREATE POLICY "Allow read access to abused_tickers"
ON public.abused_tickers
FOR SELECT
USING (true);

-- Allow insert/update for service role only (via edge functions)
CREATE POLICY "Allow service role to manage abused_tickers"
ON public.abused_tickers
FOR ALL
USING (true)
WITH CHECK (true);

-- Add index for quick lookups
CREATE INDEX idx_abused_tickers_count ON public.abused_tickers(abuse_count DESC);

-- Add last_dev_check_at column to watchlist for caching
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS last_dev_check_at TIMESTAMPTZ;

-- Seed some known abused tickers
INSERT INTO public.abused_tickers (symbol, abuse_count, is_permanent_block, notes) VALUES
('TEST', 100, true, 'Common test ticker'),
('READ', 100, true, 'Bot-generated ticker'),
('BONKBALL', 50, true, 'Bot-generated ticker'),
('BADONK', 50, true, 'Bot-generated ticker'),
('OIL', 50, true, 'Bot-generated ticker'),
('BEAST', 50, true, 'Bot-generated ticker'),
('MOON', 30, false, 'Overused generic ticker'),
('PUMP', 30, false, 'Overused generic ticker'),
('GEM', 30, false, 'Overused generic ticker'),
('100X', 30, false, 'Overused generic ticker'),
('PEPE', 20, false, 'Frequently copied ticker')
ON CONFLICT (symbol) DO NOTHING;