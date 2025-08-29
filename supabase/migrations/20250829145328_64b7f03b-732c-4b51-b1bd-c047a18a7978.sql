-- Fix function search path security warning
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