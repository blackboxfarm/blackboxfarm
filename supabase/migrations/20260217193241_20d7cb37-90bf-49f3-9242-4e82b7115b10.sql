
-- Create pumpfun_rejected_backcheck table
CREATE TABLE public.pumpfun_rejected_backcheck (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint TEXT NOT NULL UNIQUE,
  token_symbol TEXT,
  token_name TEXT,
  image_url TEXT,
  rejection_reason TEXT,
  rejection_type TEXT,
  rejected_at TIMESTAMPTZ,
  creator_wallet TEXT,
  ath_price_usd NUMERIC DEFAULT 0,
  ath_bonding_curve_pct NUMERIC DEFAULT 0,
  current_price_usd NUMERIC DEFAULT 0,
  current_market_cap_usd NUMERIC DEFAULT 0,
  is_graduated BOOLEAN DEFAULT false,
  graduated_at TIMESTAMPTZ,
  current_holders INTEGER DEFAULT 0,
  current_volume_24h_usd NUMERIC DEFAULT 0,
  peak_market_cap_usd NUMERIC DEFAULT 0,
  was_false_positive BOOLEAN DEFAULT false,
  false_positive_score INTEGER DEFAULT 0,
  checked_at TIMESTAMPTZ,
  check_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_rejected_backcheck_score ON public.pumpfun_rejected_backcheck (false_positive_score DESC);
CREATE INDEX idx_rejected_backcheck_graduated ON public.pumpfun_rejected_backcheck (is_graduated) WHERE is_graduated = true;
CREATE INDEX idx_rejected_backcheck_false_positive ON public.pumpfun_rejected_backcheck (was_false_positive) WHERE was_false_positive = true;
CREATE INDEX idx_rejected_backcheck_reason ON public.pumpfun_rejected_backcheck (rejection_reason);
CREATE INDEX idx_rejected_backcheck_checked ON public.pumpfun_rejected_backcheck (checked_at NULLS FIRST);

-- Enable RLS
ALTER TABLE public.pumpfun_rejected_backcheck ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read rejected backcheck"
  ON public.pumpfun_rejected_backcheck FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Service role handles inserts/updates (edge function)
CREATE POLICY "Service role can manage rejected backcheck"
  ON public.pumpfun_rejected_backcheck FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Updated_at trigger
CREATE TRIGGER update_rejected_backcheck_updated_at
  BEFORE UPDATE ON public.pumpfun_rejected_backcheck
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
