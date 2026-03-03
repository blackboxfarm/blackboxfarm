
-- Tier key enum
CREATE TYPE public.web_tier_key AS ENUM ('free','auth','x_subscriber','pro','dev','enterprise');

-- AI access level enum
CREATE TYPE public.ai_access_level AS ENUM ('summary','analysis','overview','full','api');

-- Tier definitions table
CREATE TABLE public.web_subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key public.web_tier_key UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  price_usd DECIMAL(6,2) DEFAULT 0,
  x_subscriber_price_usd DECIMAL(6,2) DEFAULT 0,
  features JSONB DEFAULT '{}',
  ai_access_level public.ai_access_level NOT NULL,
  max_reports_per_day INT DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User subscriptions table
CREATE TABLE public.web_user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_key public.web_tier_key NOT NULL DEFAULT 'auth',
  x_handle_linked TEXT,
  x_subscription_verified BOOLEAN DEFAULT false,
  starts_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tier_key)
);

-- Enable RLS
ALTER TABLE public.web_subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Tiers are readable by everyone (public pricing info)
CREATE POLICY "Anyone can view subscription tiers"
ON public.web_subscription_tiers FOR SELECT
USING (true);

-- Only super admins can modify tiers
CREATE POLICY "Super admins can manage tiers"
ON public.web_subscription_tiers FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
ON public.web_user_subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own subscription (for linking X handle etc)
CREATE POLICY "Users can create own subscription"
ON public.web_user_subscriptions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscription
CREATE POLICY "Users can update own subscription"
ON public.web_user_subscriptions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Super admins can manage all subscriptions
CREATE POLICY "Super admins can manage all subscriptions"
ON public.web_user_subscriptions FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Updated_at trigger for subscriptions
CREATE TRIGGER update_web_user_subscriptions_updated_at
BEFORE UPDATE ON public.web_user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_web_subscription_tiers_updated_at
BEFORE UPDATE ON public.web_subscription_tiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed tier data
INSERT INTO public.web_subscription_tiers (tier_key, display_name, price_usd, x_subscriber_price_usd, features, ai_access_level, max_reports_per_day) VALUES
  ('free', 'Free', 0, 0, '{"basic_report":true,"holder_table":true,"health_grade":true}', 'summary', 3),
  ('auth', 'Free Account', 0, 0, '{"basic_report":true,"health_dashboard":true,"whale_warnings":true,"ai_panel":true}', 'analysis', 10),
  ('x_subscriber', 'X Subscriber', 0, 0, '{"ai_overview":true,"wallet_clustering":true,"first_buyer_intel":true}', 'overview', 20),
  ('pro', 'Pro', 9.99, 7.99, '{"full_ai":true,"key_drivers":true,"reasoning_trace":true,"charts":true,"csv_export":true,"comparisons":true}', 'full', 50),
  ('dev', 'Developer', 29.99, 22.99, '{"api_access":true,"webhooks":true,"bulk_analysis":true}', 'api', 200),
  ('enterprise', 'Enterprise', 49.99, 39.99, '{"team_seats":4,"white_label":true,"priority_support":true}', 'api', 500);

-- Helper function to get user's effective tier
CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id UUID)
RETURNS public.web_tier_key
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.web_tier_key;
BEGIN
  -- Get highest active tier for user
  SELECT ws.tier_key INTO result
  FROM public.web_user_subscriptions ws
  WHERE ws.user_id = p_user_id
    AND ws.is_active = true
    AND (ws.expires_at IS NULL OR ws.expires_at > now())
  ORDER BY 
    CASE ws.tier_key
      WHEN 'enterprise' THEN 6
      WHEN 'dev' THEN 5
      WHEN 'pro' THEN 4
      WHEN 'x_subscriber' THEN 3
      WHEN 'auth' THEN 2
      WHEN 'free' THEN 1
    END DESC
  LIMIT 1;
  
  RETURN COALESCE(result, 'auth');
END;
$$;
