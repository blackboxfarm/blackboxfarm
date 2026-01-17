-- FlipIt Trade Protection Settings
-- Stores configurable parameters for trade validation, Jito bundles, etc.

CREATE TABLE IF NOT EXISTS public.flipit_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Trade Guard Settings
  max_price_premium_pct NUMERIC NOT NULL DEFAULT 10,  -- Block if executable price > X% above display price
  require_quote_check BOOLEAN NOT NULL DEFAULT true,  -- Enable/disable pre-trade validation
  block_on_high_price_impact BOOLEAN NOT NULL DEFAULT true,  -- Block if Jupiter reports high impact
  max_price_impact_pct NUMERIC NOT NULL DEFAULT 15,  -- Max acceptable price impact %
  
  -- Jito MEV Protection Settings  
  use_jito_bundles BOOLEAN NOT NULL DEFAULT false,  -- Start with false, enable when tested
  jito_tip_lamports INTEGER NOT NULL DEFAULT 10000,  -- Tip amount (~$0.002 at $200 SOL)
  
  -- Verification Settings
  use_helius_verification BOOLEAN NOT NULL DEFAULT true,  -- Use Helius for on-chain verification
  verification_retry_count INTEGER NOT NULL DEFAULT 3,
  verification_retry_delay_ms INTEGER NOT NULL DEFAULT 2000,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flipit_settings ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role has full access to flipit_settings"
ON public.flipit_settings
FOR ALL
USING (true)
WITH CHECK (true);

-- Insert default settings row (singleton pattern)
INSERT INTO public.flipit_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_flipit_settings_updated_at
BEFORE UPDATE ON public.flipit_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();