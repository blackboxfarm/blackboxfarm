-- Allstar SMS throttle: 1 SMS per allstar dev wallet per 6h
CREATE TABLE IF NOT EXISTS public.allstar_sms_throttle (
  master_wallet TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_sent INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE public.allstar_sms_throttle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.allstar_sms_throttle
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Super admins can read throttle" ON public.allstar_sms_throttle
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Seed feature flag for SMS alerting (off by default until user enables)
INSERT INTO public.intelligence_feature_flags (feature_name, enabled, description)
VALUES ('allstar_mint_sms_alerts', false, 'Send SMS to admin when an allstar dev wallet mints a new token (throttled 1 per dev per 6h).')
ON CONFLICT (feature_name) DO NOTHING;