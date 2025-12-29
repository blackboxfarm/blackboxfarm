-- Create trading tiers table for Fantasy mode
CREATE TABLE public.telegram_trading_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Trigger conditions
  requires_ape_keyword BOOLEAN NOT NULL DEFAULT false,
  min_price_usd NUMERIC,
  max_price_usd NUMERIC,
  min_market_cap_usd NUMERIC,
  max_market_cap_usd NUMERIC,
  
  -- Trade parameters
  buy_amount_usd NUMERIC NOT NULL DEFAULT 50,
  sell_target_multiplier NUMERIC NOT NULL DEFAULT 5.0,
  stop_loss_pct NUMERIC,
  stop_loss_enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadata
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_trading_tiers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read tiers
CREATE POLICY "Anyone can read trading tiers" 
ON public.telegram_trading_tiers 
FOR SELECT 
USING (true);

-- Only super admins can modify (via service role in edge functions)
CREATE POLICY "Super admins can manage tiers" 
ON public.telegram_trading_tiers 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- Insert default tiers based on screenshot
INSERT INTO public.telegram_trading_tiers (name, description, priority, requires_ape_keyword, max_price_usd, buy_amount_usd, sell_target_multiplier, icon)
VALUES 
  ('Large Buy Tier', 'Triggers when "ape" keyword detected AND price < $0.00002', 1, true, 0.00002, 100, 10.0, '🦍'),
  ('Standard Buy Tier', 'Triggers when price > $0.00004 (regardless of ape keyword)', 2, false, NULL, 50, 5.0, NULL);

-- Update the Standard tier to have min_price condition
UPDATE public.telegram_trading_tiers 
SET min_price_usd = 0.00004 
WHERE name = 'Standard Buy Tier';

-- Create trigger for updated_at
CREATE TRIGGER update_telegram_trading_tiers_updated_at
BEFORE UPDATE ON public.telegram_trading_tiers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();