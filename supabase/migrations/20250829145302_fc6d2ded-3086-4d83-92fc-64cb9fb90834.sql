-- Enhanced revenue and pricing system
CREATE TABLE public.pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name TEXT NOT NULL,
  base_fee_sol NUMERIC NOT NULL,
  per_trade_fee_sol NUMERIC NOT NULL,
  service_markup_percent NUMERIC NOT NULL DEFAULT 25.0,
  max_trades_per_hour INTEGER,
  max_wallets_per_campaign INTEGER,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Revenue tracking table
CREATE TABLE public.revenue_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  transaction_id UUID REFERENCES public.blackbox_transactions(id),
  revenue_type TEXT NOT NULL, -- 'setup_fee', 'trade_fee', 'premium_feature'
  amount_sol NUMERIC NOT NULL,
  amount_usd NUMERIC,
  sol_price_at_time NUMERIC,
  collected_at TIMESTAMPTZ DEFAULT now(),
  platform_wallet TEXT, -- Your revenue wallet address
  status TEXT DEFAULT 'pending' -- 'pending', 'collected', 'failed'
);

-- User subscription tracking
CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  pricing_tier_id UUID REFERENCES public.pricing_tiers(id),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT false,
  trades_used INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert competitive pricing tiers (15x higher than current)
INSERT INTO public.pricing_tiers (tier_name, base_fee_sol, per_trade_fee_sol, service_markup_percent, max_trades_per_hour, max_wallets_per_campaign, features) VALUES
('Starter', 0.15, 0.003, 35.0, 10, 5, '{"analytics": false, "advanced_strategies": false, "priority_support": false}'),
('Growth', 0.45, 0.0025, 30.0, 25, 15, '{"analytics": true, "advanced_strategies": false, "priority_support": false}'),
('Pro', 0.9, 0.002, 25.0, 50, 50, '{"analytics": true, "advanced_strategies": true, "priority_support": true}'),
('Enterprise', 2.5, 0.0015, 20.0, 200, 200, '{"analytics": true, "advanced_strategies": true, "priority_support": true, "white_label": true}');

-- Revenue collection wallet (your platform wallet)
CREATE TABLE public.platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.platform_config (config_key, config_value, description) VALUES
('revenue_wallet', '{"solana_address": "YOUR_REVENUE_WALLET_ADDRESS", "backup_address": "BACKUP_WALLET"}', 'Platform revenue collection wallets'),
('fee_structure', '{"setup_multiplier": 15, "trade_multiplier": 15, "min_trade_fee": 0.002}', 'Updated fee structure - 15x competitive rates'),
('pricing_active', '{"enabled": true, "require_subscription": true}', 'Pricing enforcement settings');

-- Enable RLS
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view pricing tiers" ON public.pricing_tiers FOR SELECT USING (true);

CREATE POLICY "Users can view their own revenue transactions" ON public.revenue_transactions 
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own subscriptions" ON public.user_subscriptions 
FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage platform config" ON public.platform_config 
FOR ALL USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Triggers for updated_at
CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get user's current subscription
CREATE OR REPLACE FUNCTION public.get_user_subscription(user_id_param UUID)
RETURNS TABLE(
  id UUID,
  tier_name TEXT,
  trades_used INTEGER,
  max_trades_per_hour INTEGER,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    us.id,
    pt.tier_name,
    us.trades_used,
    pt.max_trades_per_hour,
    us.expires_at,
    us.is_active
  FROM public.user_subscriptions us
  JOIN public.pricing_tiers pt ON us.pricing_tier_id = pt.id
  WHERE us.user_id = user_id_param 
    AND us.is_active = true
    AND (us.expires_at IS NULL OR us.expires_at > now())
  ORDER BY us.created_at DESC
  LIMIT 1;
END;
$$;