-- Create rug investigations table
CREATE TABLE public.rug_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  token_name TEXT,
  token_symbol TEXT,
  investigation_date TIMESTAMPTZ DEFAULT NOW(),
  
  -- Price data
  price_at_investigation NUMERIC,
  price_ath NUMERIC,
  price_drop_percent NUMERIC,
  liquidity_usd NUMERIC,
  market_cap_usd NUMERIC,
  
  -- Seller analysis
  total_sellers INTEGER DEFAULT 0,
  total_sold_usd NUMERIC DEFAULT 0,
  top_seller_wallets JSONB DEFAULT '[]'::jsonb,
  
  -- Bundle detection
  bundles_detected INTEGER DEFAULT 0,
  bundle_details JSONB DEFAULT '[]'::jsonb,
  
  -- CEX traces
  cex_traces_found INTEGER DEFAULT 0,
  cex_trace_details JSONB DEFAULT '[]'::jsonb,
  
  -- Risk assessment
  rug_risk_score INTEGER DEFAULT 0,
  risk_factors JSONB DEFAULT '[]'::jsonb,
  
  -- Full investigation data
  full_report JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.rug_investigations ENABLE ROW LEVEL SECURITY;

-- Allow super admins to read all investigations
CREATE POLICY "Super admins can read rug investigations"
ON public.rug_investigations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

-- Allow super admins to insert investigations
CREATE POLICY "Super admins can insert rug investigations"
ON public.rug_investigations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

-- Allow super admins to update investigations
CREATE POLICY "Super admins can update rug investigations"
ON public.rug_investigations
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

-- Create indexes for faster lookups
CREATE INDEX idx_rug_investigations_token_mint ON public.rug_investigations(token_mint);
CREATE INDEX idx_rug_investigations_status ON public.rug_investigations(status);
CREATE INDEX idx_rug_investigations_created_at ON public.rug_investigations(created_at DESC);

-- Add updated_at trigger
CREATE TRIGGER update_rug_investigations_updated_at
  BEFORE UPDATE ON public.rug_investigations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();