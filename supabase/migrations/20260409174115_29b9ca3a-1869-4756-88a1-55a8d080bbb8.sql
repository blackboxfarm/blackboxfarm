
-- Create buyer intent signals table
CREATE TABLE public.buyer_intent_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  pricing_page_views INT NOT NULL DEFAULT 0,
  checkout_attempts INT NOT NULL DEFAULT 0,
  last_pricing_visit TIMESTAMPTZ,
  last_checkout_attempt TIMESTAMPTZ,
  intent_level TEXT NOT NULL DEFAULT 'browsing' CHECK (intent_level IN ('browsing', 'considering', 'almost_bought')),
  funnel_tag TEXT,
  nurture_email_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.buyer_intent_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view buyer intent signals"
ON public.buyer_intent_signals
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Refresh function
CREATE OR REPLACE FUNCTION public.refresh_buyer_intent_signals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert from journey events (pricing/subscription/onboarding page views)
  INSERT INTO buyer_intent_signals (user_id, pricing_page_views, last_pricing_visit, intent_level, funnel_tag, updated_at)
  SELECT
    j.user_id,
    COUNT(*)::int AS pricing_page_views,
    MAX(j.created_at) AS last_pricing_visit,
    CASE
      WHEN COUNT(*) >= 3 THEN 'considering'
      ELSE 'browsing'
    END AS intent_level,
    CASE
      WHEN COUNT(*) >= 3 THEN 'curious_reserved'
      ELSE NULL
    END AS funnel_tag,
    now()
  FROM user_journey_events j
  WHERE j.event_type = 'page_view'
    AND (
      j.page_path LIKE '%/subscriptions%'
      OR j.page_path LIKE '%/pricing%'
      OR j.page_path LIKE '%/onboarding%'
      OR j.event_name LIKE '%subscriptions%'
      OR j.event_name LIKE '%pricing%'
      OR j.event_name LIKE '%onboarding%'
    )
    -- Only non-subscribers (no active stripe customer)
    AND NOT EXISTS (
      SELECT 1 FROM stripe_customers sc
      WHERE sc.user_id = j.user_id
        AND sc.subscription_status = 'active'
    )
  GROUP BY j.user_id
  ON CONFLICT (user_id) DO UPDATE SET
    pricing_page_views = EXCLUDED.pricing_page_views,
    last_pricing_visit = EXCLUDED.last_pricing_visit,
    intent_level = EXCLUDED.intent_level,
    funnel_tag = EXCLUDED.funnel_tag,
    updated_at = now();

  -- Layer in checkout_intents (abandoned carts)
  UPDATE buyer_intent_signals bis
  SET
    checkout_attempts = ci.attempt_count,
    last_checkout_attempt = ci.last_attempt,
    intent_level = 'almost_bought',
    funnel_tag = 'abandoned_cart',
    updated_at = now()
  FROM (
    SELECT
      user_id,
      COUNT(*)::int AS attempt_count,
      MAX(created_at) AS last_attempt
    FROM checkout_intents
    WHERE status = 'pending'
    GROUP BY user_id
  ) ci
  WHERE bis.user_id = ci.user_id;

  -- Also insert users who have checkout intents but no journey events
  INSERT INTO buyer_intent_signals (user_id, checkout_attempts, last_checkout_attempt, intent_level, funnel_tag, updated_at)
  SELECT
    ci.user_id,
    COUNT(*)::int,
    MAX(ci.created_at),
    'almost_bought',
    'abandoned_cart',
    now()
  FROM checkout_intents ci
  WHERE ci.status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM buyer_intent_signals bis WHERE bis.user_id = ci.user_id)
    AND NOT EXISTS (
      SELECT 1 FROM stripe_customers sc
      WHERE sc.user_id = ci.user_id
        AND sc.subscription_status = 'active'
    )
  GROUP BY ci.user_id
  ON CONFLICT (user_id) DO UPDATE SET
    checkout_attempts = EXCLUDED.checkout_attempts,
    last_checkout_attempt = EXCLUDED.last_checkout_attempt,
    intent_level = 'almost_bought',
    funnel_tag = 'abandoned_cart',
    updated_at = now();

  -- Clean up: remove signals for users who have since subscribed
  DELETE FROM buyer_intent_signals bis
  WHERE EXISTS (
    SELECT 1 FROM stripe_customers sc
    WHERE sc.user_id = bis.user_id
      AND sc.subscription_status = 'active'
  );
END;
$$;
