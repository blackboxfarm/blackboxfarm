-- Create pumpfun_buy_candidates table for storing tokens that passed volume surge filtering
CREATE TABLE public.pumpfun_buy_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint TEXT NOT NULL,
  token_name TEXT,
  token_symbol TEXT,
  creator_wallet TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  volume_sol_5m NUMERIC DEFAULT 0,
  volume_usd_5m NUMERIC DEFAULT 0,
  bonding_curve_pct NUMERIC,
  market_cap_usd NUMERIC,
  holder_count INTEGER DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  bundle_score INTEGER DEFAULT 0,
  is_bundled BOOLEAN DEFAULT false,
  scalp_validation_result JSONB,
  scalp_approved BOOLEAN,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'bought', 'expired')),
  auto_buy_enabled BOOLEAN DEFAULT false,
  position_id UUID REFERENCES public.flip_positions(id),
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create unique index on token_mint to prevent duplicates
CREATE UNIQUE INDEX idx_pumpfun_candidates_token_mint ON public.pumpfun_buy_candidates(token_mint);

-- Create indexes for common queries
CREATE INDEX idx_pumpfun_candidates_status ON public.pumpfun_buy_candidates(status);
CREATE INDEX idx_pumpfun_candidates_detected_at ON public.pumpfun_buy_candidates(detected_at DESC);
CREATE INDEX idx_pumpfun_candidates_scalp_approved ON public.pumpfun_buy_candidates(scalp_approved) WHERE scalp_approved = true;

-- Enable RLS
ALTER TABLE public.pumpfun_buy_candidates ENABLE ROW LEVEL SECURITY;

-- Allow super admins to manage candidates
CREATE POLICY "Super admins can manage pumpfun candidates"
ON public.pumpfun_buy_candidates
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role has full access to pumpfun candidates"
ON public.pumpfun_buy_candidates
FOR ALL
USING (auth.role() = 'service_role');

-- Create trigger for updated_at
CREATE TRIGGER update_pumpfun_candidates_updated_at
BEFORE UPDATE ON public.pumpfun_buy_candidates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create monitor config table for settings
CREATE TABLE public.pumpfun_monitor_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  min_volume_sol_5m NUMERIC NOT NULL DEFAULT 1.0,
  min_transactions INTEGER NOT NULL DEFAULT 10,
  max_token_age_minutes INTEGER NOT NULL DEFAULT 10,
  max_bundle_score INTEGER NOT NULL DEFAULT 70,
  auto_scalp_enabled BOOLEAN NOT NULL DEFAULT false,
  scalp_test_mode BOOLEAN NOT NULL DEFAULT true,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_poll_at TIMESTAMPTZ,
  tokens_processed_count INTEGER DEFAULT 0,
  candidates_found_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default config
INSERT INTO public.pumpfun_monitor_config (id) VALUES (gen_random_uuid());

-- Enable RLS on config
ALTER TABLE public.pumpfun_monitor_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage pumpfun config"
ON public.pumpfun_monitor_config
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

CREATE POLICY "Service role has full access to pumpfun config"
ON public.pumpfun_monitor_config
FOR ALL
USING (auth.role() = 'service_role');

-- Add comments
COMMENT ON TABLE public.pumpfun_buy_candidates IS 'Tokens detected by Pump.fun monitor that passed volume surge filtering';
COMMENT ON TABLE public.pumpfun_monitor_config IS 'Configuration for the Pump.fun new token monitor';
COMMENT ON COLUMN public.pumpfun_buy_candidates.volume_sol_5m IS 'SOL volume in the first 5 minutes after token creation';
COMMENT ON COLUMN public.pumpfun_buy_candidates.bundle_score IS 'Risk score from bundle analysis (0-100, higher = riskier)';
COMMENT ON COLUMN public.pumpfun_buy_candidates.scalp_approved IS 'Whether the token passed scalp-mode-validator checks';